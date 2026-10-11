from typing import List, Dict, Any
import google.generativeai as genai
from app.config import settings
import hashlib
import json
import re

# Configure Gemini if API key is available
if settings.GEMINI_API_KEY and not settings.STUB_MODE:
    genai.configure(api_key=settings.GEMINI_API_KEY)

BILLING = {"refund", "invoice", "charge", "card", "payment", "billing"}
TECH = {"error", "bug", "stack", "crash", "login", "auth", "trace"}
SHIP = {"delivery", "shipment", "shipping", "package", "track", "courier", "delayed"}

class LLMProvider:
    RESOURCE_CATEGORIES = {
        "standard_computer", "workstation", "server", "gpu_system",
        "networking", "storage", "other"
    }
    SPEC_FIELDS = {
        "cpuCores", "memoryGb", "storageGb", "storageType", "gpuModel",
        "gpuCount", "gpuMemoryGb", "operatingSystem", "formFactor",
        "networkPorts", "networkSpeedGbps"
    }

    def extract_resource_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        source = " ".join([
            request.get("title", ""),
            request.get("purpose", ""),
            request.get("description", "")
        ]).strip()
        source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()
        if settings.STUB_MODE:
            result = self._stub_resource_extraction(request, source)
        else:
            result = self._gemini_resource_extraction(request, source)
        result["sourceHash"] = source_hash
        result["model"] = "deterministic-resource-extractor" if settings.STUB_MODE else settings.MODEL
        return result

    def _normalise_resource_result(self, result: Dict[str, Any], request: Dict[str, Any]) -> Dict[str, Any]:
        category = result.get("category") or request.get("category")
        specifications = result.get("specifications") or {}
        specifications = {k: v for k, v in specifications.items() if k in self.SPEC_FIELDS and v not in ("", None)}
        quantity = result.get("quantity") or request.get("quantity", 1)
        missing = list(dict.fromkeys(str(v) for v in result.get("missingFields", [])))
        ambiguities = list(dict.fromkeys(str(v) for v in result.get("ambiguities", [])))
        if category not in self.RESOURCE_CATEGORIES:
            return {
                "extractionStatus": "UNSUPPORTED",
                "escalationOutcome": "HUMAN_REVIEW",
                "category": None,
                "purpose": request.get("purpose"),
                "specifications": specifications,
                "quantity": quantity,
                "missingFields": missing,
                "ambiguities": ambiguities,
                "confidence": result.get("confidence"),
                "reason": "The request could not be classified into a supported resource category."
            }
        if not specifications and category != "other":
            missing.append("specifications")
        if missing or ambiguities:
            return {
                "extractionStatus": "NEEDS_CLARIFICATION",
                "escalationOutcome": "REQUEST_CLARIFICATION",
                "category": category,
                "purpose": result.get("purpose") or request.get("purpose"),
                "specifications": specifications,
                "quantity": quantity,
                "missingFields": missing,
                "ambiguities": ambiguities,
                "confidence": result.get("confidence"),
                "reason": result.get("reason") or "More specific resource requirements are needed before automatic allocation."
            }
        return {
            "extractionStatus": "EXTRACTED",
            "escalationOutcome": "NONE",
            "category": category,
            "purpose": result.get("purpose") or request.get("purpose"),
            "specifications": specifications,
            "quantity": quantity,
            "missingFields": [],
            "ambiguities": [],
            "confidence": result.get("confidence"),
            "reason": result.get("reason") or "Requirements extracted and ready for deterministic matching."
        }

    def _stub_resource_extraction(self, request: Dict[str, Any], source: str) -> Dict[str, Any]:
        text = source.lower()
        category = request.get("category")
        if not category:
            if "server" in text:
                category = "server"
            elif any(word in text for word in ("gpu", "machine learning", "ml workstation")):
                category = "gpu_system"
            elif any(word in text for word in ("switch", "router", "network")):
                category = "networking"
            elif any(word in text for word in ("storage", "nas", "drive")):
                category = "storage"
            elif any(word in text for word in ("computer", "laptop", "workstation", "desktop")):
                category = "standard_computer"
        specs = dict(request.get("specifications") or {})
        patterns = {
            "cpuCores": r"(?:at least|minimum|with)?\s*(\d+)\s*(?:cpu\s*)?cores?",
            "memoryGb": r"(\d+)\s*(?:gb|gib)\s*(?:ram|memory)",
            "storageGb": r"(\d+)\s*(?:gb|tb)\s*(?:storage|disk)",
            "gpuMemoryGb": r"(\d+)\s*(?:gb|gib)\s*(?:gpu|vram)",
            "gpuCount": r"(\d+)\s*gpus?",
            "networkPorts": r"(\d+)[-\s]?port",
        }
        for field, pattern in patterns.items():
            match = re.search(pattern, text)
            if match and field not in specs:
                value = int(match.group(1))
                if field == "storageGb" and ("tb" in match.group(0)):
                    value *= 1024
                specs[field] = value
        if "nvme" in text:
            specs.setdefault("storageType", "nvme")
        elif "ssd" in text:
            specs.setdefault("storageType", "ssd")
        elif "hdd" in text:
            specs.setdefault("storageType", "hdd")
        if "ubuntu" in text:
            specs.setdefault("operatingSystem", "Ubuntu 22.04")
        elif "windows" in text:
            specs.setdefault("operatingSystem", "Windows 11")
        if category == "gpu_system" and "gpuCount" not in specs:
            specs["gpuCount"] = 1
        missing = []
        if category in {"gpu_system", "workstation"} and "memoryGb" not in specs:
            missing.append("memoryGb")
        if category == "gpu_system" and "gpuMemoryGb" not in specs:
            missing.append("gpuMemoryGb")
        return self._normalise_resource_result({
            "category": category,
            "specifications": specs,
            "quantity": request.get("quantity", 1),
            "missingFields": missing,
            "confidence": 0.9 if not missing else 0.45
        }, request)

    def _gemini_resource_extraction(self, request: Dict[str, Any], source: str) -> Dict[str, Any]:
        prompt = f"""Extract IT resource requirements as JSON only.
Supported categories: standard_computer, workstation, server, gpu_system, networking, storage, other.
Allowed specification keys: {sorted(self.SPEC_FIELDS)}.
Do not guess. Use missingFields or ambiguities when the text is unclear.
Return category, specifications, quantity, missingFields, ambiguities, confidence, reason.
Request: {source}"""
        model = genai.GenerativeModel(settings.MODEL)
        response = model.generate_content(prompt, generation_config={"response_mime_type": "application/json"})
        try:
            result = json.loads(response.text)
        except (json.JSONDecodeError, TypeError) as error:
            raise ValueError("Gemini returned invalid resource extraction JSON") from error
        return self._normalise_resource_result(result, request)
    def classify(self, text: str) -> Dict:
        """
        Classify ticket text into categories with confidence score.
        Returns: { "predictedCategory": "billing|tech|shipping|other", "confidence": 0.0-1.0 }
        """
        if settings.STUB_MODE:
            # Enhanced deterministic classification for stub mode
            t = text.lower()
            score = {"billing": 0, "tech": 0, "shipping": 0, "other": 0}
            
            # Primary keyword matching with weighted scoring
            for word in BILLING: 
                if word in t:
                    # Count exact matches and partial matches
                    exact_count = t.count(word)
                    score["billing"] += exact_count * 3  # Higher weight for exact matches
                    
            for word in TECH: 
                if word in t:
                    exact_count = t.count(word)
                    score["tech"] += exact_count * 3
                    
            for word in SHIP: 
                if word in t:
                    exact_count = t.count(word)
                    score["shipping"] += exact_count * 3
            
            # Secondary indicators with lower weights
            billing_indicators = ["money", "cost", "price", "subscription", "account", "plan", "charged", "fee", "transaction"]
            tech_indicators = ["broken", "not working", "cannot", "can't", "issue", "problem", "fix", "support", "help"]
            shipping_indicators = ["order", "product", "item", "received", "arrive", "delivery", "package", "sent"]
            
            for indicator in billing_indicators:
                if indicator in t:
                    score["billing"] += t.count(indicator)
                    
            for indicator in tech_indicators:
                if indicator in t:
                    score["tech"] += t.count(indicator)
                    
            for indicator in shipping_indicators:
                if indicator in t:
                    score["shipping"] += t.count(indicator)
            
            # Determine winning category
            max_score = max(score.values())
            if max_score == 0:
                return {"predictedCategory": "other", "confidence": 0.3}
            
            winning_category = max(score, key=score.get)
            
            # Enhanced confidence calculation based on:
            # 1. Keyword density relative to text length
            # 2. Score margin over other categories  
            # 3. Absolute score threshold
            text_words = len(t.split())
            keyword_density = max_score / max(1, text_words)
            
            # Base confidence from keyword density
            confidence_base = min(0.9, keyword_density * 2)
            
            # Boost for clear margin over other categories
            other_scores = [score[cat] for cat in score if cat != winning_category]
            if other_scores:
                max_other = max(other_scores)
                margin = (max_score - max_other) / max(1, max_score)
                confidence_base += margin * 0.3
            
            # Boost for multiple strong indicators
            if max_score >= 5:
                confidence_base += 0.2
            elif max_score >= 3:
                confidence_base += 0.1
            
            # Ensure confidence is in valid range
            final_confidence = max(0.3, min(0.95, confidence_base))
            
            return {
                "predictedCategory": winning_category, 
                "confidence": round(final_confidence, 3)
            }
        
        # Real Gemini classification with enhanced prompting
        try:
            prompt = f"""You are an expert customer support ticket classifier. Analyze the following ticket and classify it into one of these categories:

**Categories:**
- billing: Payment issues, refunds, invoices, charges, subscription problems, account billing, pricing questions
- tech: Technical problems, bugs, errors, login issues, authentication failures, system crashes, performance issues
- shipping: Delivery problems, package tracking, shipment delays, courier issues, product not received, shipping damage
- other: General inquiries, product questions, feature requests, compliments, or anything not fitting above categories

**Analysis Guidelines:**
- Look for specific keywords and context clues
- Consider the customer's intent and primary concern
- If multiple categories apply, choose the most prominent one
- Rate confidence based on clarity of indicators

**Ticket Content:**
{text}

**Required Response Format:**
Category: [category]
Confidence: [0.0-1.0]
Reasoning: [brief explanation]"""

            model = genai.GenerativeModel(settings.MODEL)
            response = model.generate_content(prompt)
            
            # Parse response with better error handling
            lines = response.text.strip().split('\n')
            category = "other"
            confidence = 0.5
            reasoning = ""
            
            for line in lines:
                line = line.strip()
                if line.startswith("Category:"):
                    category = line.split(":", 1)[1].strip().lower()
                elif line.startswith("Confidence:"):
                    try:
                        conf_str = line.split(":", 1)[1].strip()
                        # Handle various formats like "0.8", "80%", "8/10"
                        if '%' in conf_str:
                            confidence = float(conf_str.replace('%', '')) / 100
                        elif '/' in conf_str:
                            parts = conf_str.split('/')
                            confidence = float(parts[0]) / float(parts[1])
                        else:
                            confidence = float(conf_str)
                    except:
                        confidence = 0.5
                elif line.startswith("Reasoning:"):
                    reasoning = line.split(":", 1)[1].strip()
            
            # Validate and adjust category
            valid_categories = ["billing", "tech", "shipping", "other"]
            if category not in valid_categories:
                # Try to map common variations
                category_mapping = {
                    "technical": "tech", "technology": "tech", "bug": "tech",
                    "payment": "billing", "financial": "billing", "invoice": "billing",
                    "delivery": "shipping", "logistics": "shipping", "transport": "shipping"
                }
                category = category_mapping.get(category, "other")
            
            # Ensure confidence is in valid range
            confidence = max(0.0, min(1.0, confidence))
            
            return {
                "predictedCategory": category,
                "confidence": round(confidence, 2),
                "reasoning": reasoning[:200] if reasoning else None  # Limit reasoning length
            }
            
        except Exception as e:
            # Fallback to keyword classification if Gemini fails
            t = text.lower()
            score = {"billing": 0, "tech": 0, "shipping": 0, "other": 0}
            
            for w in BILLING: 
                score["billing"] += t.count(w)
            for w in TECH: 
                score["tech"] += t.count(w)
            for w in SHIP: 
                score["shipping"] += t.count(w)
            
            cat = max(score, key=score.get)
            conf = min(1.0, (score[cat] / 3.0)) if score[cat] > 0 else 0.3
            
            return {
                "predictedCategory": cat if score[cat] > 0 else "other", 
                "confidence": round(conf, 2)
            }

    def draft(self, text: str, articles: List[Dict]) -> Dict:
        """
        Generate formatted customer support response using best KB match with strict formatting rules.
        Returns: { "draftReply": "...", "citations": ["<articleId>", "<articleId>"] }
        """
        # Always use numbered steps from the KB article for the draft reply
        if not articles:
            return {
                "draftReply": """Hello,

Thank you for contacting our support team. We've received your inquiry and are reviewing it carefully.

Our team will respond within 24 hours with detailed assistance tailored to your specific needs.

Please don't hesitate to reply if you have any additional questions in the meantime.

Best regards,
Customer Support Team""",
                "citations": []
            }

        best_article = articles[0]
        article_id = best_article.get('id', '1')
        article_title = best_article.get('title', 'Support Guide')
        kb_body = best_article.get('body', best_article.get('content', ''))

        # Extract only numbered steps from the KB article
        import re
        numbered_steps = re.findall(r'^[0-9]+\.\s.*', kb_body, re.MULTILINE)
        if numbered_steps:
            steps_text = '\n'.join(numbered_steps)
        else:
            steps_text = kb_body.strip()

        response_parts = [
            "Hello,",
            "",
            "Thank you for contacting our support team.",
            "",
            "Based on our knowledge base, here are the steps to resolve your issue:",
            "",
            steps_text,
            "",
            f"Note: These steps are based on our comprehensive {article_title.lower()} documentation.",
            "",
            f"This information is based on [Article #{article_id}]. Please reply if you need further assistance!",
            "",
            "Best regards,",
            "Customer Support Team"
        ]

        return {
            "draftReply": '\n'.join(response_parts),
            "citations": [str(article_id)]
        }
    
    def _ensure_proper_formatting(self, response_text: str, kb_id: str, original_request: str) -> str:
        """Ensure the response follows the strict formatting rules"""
        lines = response_text.split('\n')
        
        # Ensure proper greeting
        if not any(lines[0].strip().startswith(greeting) for greeting in ["Hello", "Hi", "Dear"]):
            lines.insert(0, "Hello,")
            lines.insert(1, "")
        
        # Ensure proper closure with citation
        has_citation = f"[Article #{kb_id}]" in response_text
        has_proper_closing = any("Best regards" in line or "Sincerely" in line for line in lines[-3:])
        
        if not has_citation or not has_proper_closing:
            # Find where to insert the closing
            closing_lines = [
                "",
                f"This information is based on [Article #{kb_id}]. Please reply if you need further assistance!",
                "",
                "Best regards,",
                "Customer Support Team"
            ]
            
            # Remove existing inadequate closing
            while lines and (not lines[-1].strip() or lines[-1].strip() in ["Best regards", "Sincerely", "Thank you"]):
                lines.pop()
            
            lines.extend(closing_lines)
        
        return '\n'.join(lines)
    
    def _extract_citations(self, response_text: str, articles: List[Dict]) -> List[str]:
        """Extract and validate citations from the response"""
        citations = []
        import re
        
        # Look for various citation patterns
        citation_patterns = [
            r'Article #(\w+)',
            r'\[Article #(\w+)\]',
            r'\[#(\w+)\]'
        ]
        
        for pattern in citation_patterns:
            matches = re.findall(pattern, response_text, re.IGNORECASE)
            for match in matches:
                # Verify this article exists in our provided articles
                for article in articles:
                    if str(article.get('id', '')) == str(match):
                        if match not in citations:
                            citations.append(str(match))
        
        # Ensure we have at least one citation if articles were provided
        if not citations and articles:
            citations = [str(articles[0].get('id', '1'))]
        
        return citations

provider = LLMProvider()

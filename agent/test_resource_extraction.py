import unittest

from app.llm_provider import LLMProvider


class ResourceExtractionTests(unittest.TestCase):
    def setUp(self):
        self.provider = LLMProvider()

    def extract(self, body):
        result = self.provider._stub_resource_extraction({
            "title": "Compute resource request",
            "purpose": body,
            "description": body,
            "category": "other",
            "quantity": 1,
            "specifications": {},
        }, body)
        return result["specifications"]

    def test_exact_requirement_email_keeps_ram_and_storage_separate(self):
        specs = self.extract(
            "CPU: at least 8 cores\n"
            "RAM: at least 32 GB\n"
            "Storage: at least 512 GB SSD\n"
            "GPU: at least one dedicated GPU\n"
            "GPU memory: at least 8 GB VRAM"
        )
        self.assertEqual(specs["cpuCores"], 8)
        self.assertEqual(specs["memoryGb"], 32)
        self.assertEqual(specs["storageGb"], 512)
        self.assertEqual(specs["storageType"], "ssd")
        self.assertEqual(specs["gpuCount"], 1)
        self.assertEqual(specs["gpuMemoryGb"], 8)

    def test_markdown_and_html_tables_are_supported(self):
        markdown = "| RAM | 32 GB |\n| Storage | 1 TB NVMe |\n| GPU memory | 8192 MB |"
        specs = self.extract(markdown)
        self.assertEqual(specs["memoryGb"], 32)
        self.assertEqual(specs["storageGb"], 1024)
        self.assertEqual(specs["storageType"], "nvme")
        self.assertEqual(specs["gpuMemoryGb"], 8)

        html = "<table><tr><td>RAM</td><td>32 GB</td></tr><tr><td>Storage</td><td>512 GB SSD</td></tr></table>"
        html_specs = self.extract(html)
        self.assertEqual(html_specs["memoryGb"], 32)
        self.assertEqual(html_specs["storageGb"], 512)
        self.assertEqual(html_specs["storageType"], "ssd")

    def test_unlabelled_numbers_do_not_become_requirements(self):
        specs = self.extract("The project has 32 users and needs a fast computer.")
        self.assertNotIn("memoryGb", specs)
        self.assertNotIn("storageGb", specs)

    def test_unsupported_category_is_escalated_without_fabricating_fields(self):
        result = self.provider._normalise_resource_result(
            {"category": "quantum computer", "specifications": {"memoryGb": "unknown"}},
            {"purpose": "Research", "quantity": 1}
        )
        self.assertEqual(result["extractionStatus"], "UNSUPPORTED")
        self.assertEqual(result["specifications"], {})


if __name__ == "__main__":
    unittest.main()

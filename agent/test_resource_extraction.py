import unittest

from app.llm_provider import LLMProvider


class ResourceExtractionTests(unittest.TestCase):
    def setUp(self):
        self.provider = LLMProvider()

    def extract(self, body, title="Compute resource request"):
        result = self.extract_full(body, title=title)
        return result["specifications"]

    def extract_full(self, body, title="Compute resource request"):
        return self.provider._stub_resource_extraction({
            "title": title,
            "purpose": body,
            "description": body,
            "category": "other",
            "quantity": 1,
            "specifications": {},
        }, f"{title} {body}")

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

    def test_explicit_gpu_workstation_infers_workstation_category(self):
        body = (
            "I need a high-performance workstation for model training.\n"
            "CPU: at least 16 cores\n"
            "RAM: at least 64 GB\n"
            "Storage: at least 2000 GB NVMe\n"
            "GPU memory: at least 24 GB VRAM\n"
            "GPU: at least one dedicated GPU\n"
            "Operating system: Ubuntu 22.04\n"
            "Quantity: 1"
        )
        result = self.extract_full(body, title="Workstation request")
        self.assertEqual(result["category"], "workstation")
        self.assertEqual(result["extractionStatus"], "EXTRACTED")
        specs = result["specifications"]
        self.assertEqual(specs["cpuCores"], 16)
        self.assertEqual(specs["memoryGb"], 64)
        self.assertEqual(specs["storageGb"], 2000)
        self.assertEqual(specs["storageType"], "nvme")
        self.assertEqual(specs["gpuCount"], 1)
        self.assertEqual(specs["gpuMemoryGb"], 24)
        self.assertEqual(specs["operatingSystem"], "Ubuntu 22.04")

    def test_explicit_workstation_without_gpu_infers_workstation_category(self):
        body = (
            "We need an engineering workstation for CAD design.\n"
            "CPU: at least 16 cores\n"
            "RAM: at least 32 GB\n"
            "Storage: at least 1000 GB SSD\n"
            "Operating system: Windows 11"
        )
        result = self.extract_full(body, title="CAD workstation")
        self.assertEqual(result["category"], "workstation")
        self.assertEqual(result["extractionStatus"], "EXTRACTED")
        specs = result["specifications"]
        self.assertEqual(specs["cpuCores"], 16)
        self.assertEqual(specs["memoryGb"], 32)
        self.assertEqual(specs["storageGb"], 1000)
        self.assertEqual(specs["storageType"], "ssd")
        self.assertEqual(specs["operatingSystem"], "Windows 11")

    def test_explicit_server_request_infers_server_category(self):
        body = (
            "Please provision an application server for web services.\n"
            "CPU: at least 32 cores\n"
            "RAM: at least 128 GB\n"
            "Storage: at least 4000 GB SSD"
        )
        result = self.extract_full(body, title="Application server request")
        self.assertEqual(result["category"], "server")
        self.assertEqual(result["extractionStatus"], "EXTRACTED")
        specs = result["specifications"]
        self.assertEqual(specs["cpuCores"], 32)
        self.assertEqual(specs["memoryGb"], 128)
        self.assertEqual(specs["storageGb"], 4000)

    def test_genuine_gpu_compute_node_and_cluster_infer_gpu_system(self):
        node_result = self.extract_full(
            "Need a GPU compute node for distributed LLM fine-tuning.\n"
            "CPU: at least 32 cores\n"
            "RAM: at least 128 GB\n"
            "GPU memory: at least 48 GB VRAM\n"
            "GPU: at least one dedicated GPU",
            title="GPU compute node request"
        )
        self.assertEqual(node_result["category"], "gpu_system")
        self.assertEqual(node_result["extractionStatus"], "EXTRACTED")

        cluster_result = self.extract_full(
            "Provision a 4-node GPU cluster with InfiniBand networking.",
            title="GPU cluster allocation"
        )
        self.assertEqual(cluster_result["category"], "gpu_system")

    def test_networking_and_storage_inferences_are_preserved(self):
        net_result = self.extract_full(
            "Need a 48-port network switch with 10Gbps uplinks.",
            title="Core switch replacement"
        )
        self.assertEqual(net_result["category"], "networking")

        storage_result = self.extract_full(
            "We require a 24 TB NAS storage array for raw lab data archives.",
            title="Research storage system"
        )
        self.assertEqual(storage_result["category"], "storage")


if __name__ == "__main__":
    unittest.main()

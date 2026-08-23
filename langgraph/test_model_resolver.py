import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))

from model_resolver import (
    OpenRouterRotatingChatModel,
    clear_resolver_cache,
    get_llm,
    get_openrouter_keys,
    is_local_available,
    resolve,
)


class TestModelResolver(unittest.TestCase):
    def setUp(self):
        clear_resolver_cache()

    def tearDown(self):
        clear_resolver_cache()

    def test_get_openrouter_keys_multi_and_single(self):
        with patch.dict(
            os.environ,
            {
                "OPENROUTER_API_KEYS": "sk-or-v1-key1, sk-or-v1-key2; sk-or-v1-key3",
                "OPENROUTER_API_KEY": "sk-or-v1-key3, sk-or-v1-key4",
            },
            clear=True,
        ):
            keys = get_openrouter_keys()
            self.assertEqual(
                keys,
                ["sk-or-v1-key1", "sk-or-v1-key2", "sk-or-v1-key3", "sk-or-v1-key4"],
            )

    def test_openrouter_rotating_model_rotates_on_429(self):
        keys = ["key-alpha", "key-beta"]
        model = OpenRouterRotatingChatModel(
            model="anthropic/claude-3.7-sonnet", keys=keys
        )

        mock_client_alpha = MagicMock()
        mock_client_alpha.invoke.side_effect = Exception(
            "HTTP 429: Rate limit exceeded or quota exhausted"
        )

        mock_client_beta = MagicMock()
        mock_client_beta.invoke.return_value = MagicMock(content="Success with key-beta")

        with patch.object(
            model,
            "_get_client_for_key",
            side_effect=lambda k: mock_client_alpha if k == "key-alpha" else mock_client_beta,
        ):
            result = model.invoke("Hello world")
            self.assertEqual(result.content, "Success with key-beta")
            mock_client_alpha.invoke.assert_called_once()
            mock_client_beta.invoke.assert_called_once()

    def test_is_local_available_probe(self):
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.status = 200
            mock_urlopen.return_value.__enter__.return_value = mock_resp

            self.assertTrue(is_local_available("http://localhost:11434"))

    def test_resolve_openrouter_provider_first(self):
        with patch.dict(
            os.environ,
            {"OPENROUTER_API_KEY": "sk-or-test-key"},
            clear=True,
        ):
            clear_resolver_cache()
            provider, model = resolve("reasoning")
            self.assertEqual(provider, "openrouter")
            self.assertIn("claude", model.lower())

    def test_resolve_local_provider_fallback(self):
        with patch.dict(
            os.environ,
            {
                "LANGGRAPH_PROVIDER_ORDER": "local",
                "LANGGRAPH_PROBE_LOCAL": "0",
            },
            clear=True,
        ):
            clear_resolver_cache()
            provider, model = resolve("code")
            self.assertEqual(provider, "local")
            self.assertIn("qwen", model.lower())

    def test_get_llm_by_task(self):
        with patch.dict(
            os.environ,
            {"OPENROUTER_API_KEY": "sk-or-test-key"},
            clear=True,
        ):
            clear_resolver_cache()
            llm = get_llm(task="solution_architecture")
            self.assertIsNotNone(llm)


if __name__ == "__main__":
    unittest.main()

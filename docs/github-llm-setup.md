# GitHub LLM Models Setup Guide

GitHub Models is a service that lets you use various AI models for free with just a GitHub account.

## Step 1: Generate a GitHub Personal Access Token

1. Visit https://github.com/settings/tokens (GitHub login required)
2. Click "Generate new token" > "Generate new token (classic)"
3. Note: `Sancho` (or any name you like)
4. Expiration: Choose your preferred duration
5. No scopes need to be selected
6. Click "Generate token"
7. Copy the generated token (a string starting with `ghp_`)

## Step 2: Sancho Settings

1. Go to Settings > LLM Models tab
2. Enter the API Key in the GitHub Copilot section (`ghp_...`)
3. Click Save Settings

## Step 3: Add Models

1. In the model addition area at the bottom of Settings > LLM Models tab
2. Select Provider: `github`
3. Enter a Model ID (see available models below)
4. Click Add

## Available Models (examples)

| Model ID | Description |
|----------|-------------|
| `gpt-4o` | OpenAI GPT-4o |
| `gpt-4o-mini` | OpenAI GPT-4o Mini |
| `o3-mini` | OpenAI o3-mini |
| `Phi-4` | Microsoft Phi-4 |
| `Mistral-large` | Mistral Large |
| `DeepSeek-R1` | DeepSeek R1 |

Full model list: https://github.com/marketplace/models

## Notes

- **Free to use**: Available for free with a GitHub account (daily request limits apply)
- **API endpoint**: `https://models.inference.ai.azure.com` (automatically configured)
- **Token expiration**: If your token expires, generate a new one on GitHub and replace it

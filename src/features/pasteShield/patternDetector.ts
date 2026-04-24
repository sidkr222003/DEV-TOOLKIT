/**
 * PasteShield — Pattern Detection Engine
 * Scans pasted content for secrets, credentials, and unsafe code patterns.
 * All regexes are pre-compiled and cached for performance.
 *
 * Updated: 2026 — expanded coverage across AI providers, cloud platforms,
 * CI/CD, databases, mobile, IoT, payment processors, and more.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface DetectionResult {
  type: string;
  description: string;
  match: string;        // Truncated/redacted match for display
  severity: Severity;
  line?: number;        // 1-indexed line number of first match
  category?: string;   // Pattern category for grouping
}

interface PatternDefinition {
  name: string;
  regex: RegExp;
  severity: Severity;
  description: string;
  redact?: boolean;     // Mask most of the match in output
  category: string;
}

// Pre-compiled pattern registry
const PATTERN_DEFINITIONS: PatternDefinition[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── AI / LLM PROVIDERS ──────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'OpenAI API Key (sk-)',
    regex: /sk-[a-zA-Z0-9]{32,}/g,
    severity: 'critical',
    description: 'OpenAI API key detected — grants full API access including billing.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'OpenAI API Key (sk-proj-)',
    regex: /sk-proj-[a-zA-Z0-9\-_]{80,}/g,
    severity: 'critical',
    description: 'OpenAI project-scoped API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'OpenAI Org ID',
    regex: /org-[a-zA-Z0-9]{24}/g,
    severity: 'high',
    description: 'OpenAI Organization ID detected — can be used to route billing.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'Anthropic API Key',
    regex: /sk-ant-(?:api\d{2}-)?[a-zA-Z0-9\-_]{88,}/g,
    severity: 'critical',
    description: 'Anthropic API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'Google Gemini API Key',
    regex: /AIza[0-9A-Za-z\-_]{35}/g,
    severity: 'critical',
    description: 'Google Gemini / Google API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'Mistral API Key',
    regex: /(?:MISTRAL_API_KEY|mistral[_-]?key)\s*[:=]\s*['"]?([a-zA-Z0-9]{32,})['"]?/gi,
    severity: 'critical',
    description: 'Mistral AI API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'Cohere API Key',
    regex: /(?:co-)[a-zA-Z0-9]{40}/g,
    severity: 'critical',
    description: 'Cohere API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'Hugging Face Token',
    regex: /hf_[a-zA-Z0-9]{34,}/g,
    severity: 'critical',
    description: 'Hugging Face User Access Token detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'Replicate API Token',
    regex: /r8_[a-zA-Z0-9]{38}/g,
    severity: 'critical',
    description: 'Replicate API token detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'Together AI API Key',
    regex: /(?:TOGETHER_API_KEY|together[_-]?api[_-]?key)\s*[:=]\s*['"]?([a-zA-Z0-9]{40,})['"]?/gi,
    severity: 'critical',
    description: 'Together AI API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'Groq API Key',
    regex: /gsk_[a-zA-Z0-9]{52}/g,
    severity: 'critical',
    description: 'Groq API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'Perplexity API Key',
    regex: /pplx-[a-zA-Z0-9]{48}/g,
    severity: 'critical',
    description: 'Perplexity API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'ElevenLabs API Key',
    regex: /(?:ELEVEN_API_KEY|elevenlabs[_-]?key)\s*[:=]\s*['"]?([a-zA-Z0-9]{32,})['"]?/gi,
    severity: 'critical',
    description: 'ElevenLabs API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'Stability AI API Key',
    regex: /sk-[a-zA-Z0-9]{48}(?=[^-])/g,
    severity: 'critical',
    description: 'Stability AI API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'OpenRouter API Key',
    regex: /sk-or-v1-[a-zA-Z0-9]{64}/g,
    severity: 'critical',
    description: 'OpenRouter API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'Azure OpenAI Endpoint Key',
    regex: /(?:azure[_-]?openai[_-]?key|AZURE_OPENAI_KEY)\s*[:=]\s*['"]?([a-fA-F0-9]{32})['"]?/gi,
    severity: 'critical',
    description: 'Azure OpenAI endpoint API key detected.',
    redact: true,
    category: 'AI Providers',
  },
  {
    name: 'LangSmith API Key',
    regex: /ls__[a-zA-Z0-9]{32,}/g,
    severity: 'high',
    description: 'LangSmith / LangChain tracing API key detected.',
    redact: true,
    category: 'AI Providers',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── AWS ─────────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'AWS Access Key ID',
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    severity: 'critical',
    description: 'AWS Access Key ID detected — matches all AWS key prefixes.',
    redact: true,
    category: 'AWS',
  },
  {
    name: 'AWS Secret Access Key',
    regex: /(?:aws[_\-\s]?secret[_\-\s]?(?:access[_\-\s]?)?key|AWS_SECRET(?:_ACCESS_KEY)?)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
    severity: 'critical',
    description: 'AWS Secret Access Key detected.',
    redact: true,
    category: 'AWS',
  },
  {
    name: 'AWS Session Token',
    regex: /(?:aws[_-]?session[_-]?token|AWS_SESSION_TOKEN)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{100,})['"]?/gi,
    severity: 'critical',
    description: 'AWS Session Token detected — temporary credentials with elevated risk.',
    redact: true,
    category: 'AWS',
  },
  {
    name: 'AWS Account ID',
    regex: /\b(\d{12})\b(?=.*(?:aws|arn|account))/gi,
    severity: 'medium',
    description: 'AWS Account ID detected — useful for targeted attacks.',
    redact: true,
    category: 'AWS',
  },
  {
    name: 'AWS SNS/SQS/ARN',
    regex: /arn:aws:[a-z0-9\-]+:[a-z0-9\-]*:\d{12}:[^\s'"]+/g,
    severity: 'low',
    description: 'AWS ARN detected — reveals account/resource topology.',
    redact: false,
    category: 'AWS',
  },
  {
    name: 'AWS S3 Pre-signed URL',
    regex: /https:\/\/[a-z0-9\-]+\.s3(?:\.[a-z0-9\-]+)?\.amazonaws\.com\/[^\s'"]*X-Amz-Signature=[a-fA-F0-9]+/g,
    severity: 'high',
    description: 'AWS S3 pre-signed URL detected — grants temporary object access.',
    redact: true,
    category: 'AWS',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── GOOGLE CLOUD ────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Google Cloud Service Account Key (JSON)',
    regex: /"type"\s*:\s*"service_account"[\s\S]{0,200}"private_key"\s*:/g,
    severity: 'critical',
    description: 'Google Cloud service account JSON key detected.',
    redact: false,
    category: 'Google Cloud',
  },
  {
    name: 'Google OAuth Client Secret',
    regex: /GOCSPX-[a-zA-Z0-9\-_]{28}/g,
    severity: 'critical',
    description: 'Google OAuth 2.0 client secret detected.',
    redact: true,
    category: 'Google Cloud',
  },
  {
    name: 'Google OAuth Refresh Token',
    regex: /1\/\/[a-zA-Z0-9\-_]{38,}/g,
    severity: 'critical',
    description: 'Google OAuth refresh token detected.',
    redact: true,
    category: 'Google Cloud',
  },
  {
    name: 'Firebase Admin SDK Credential',
    regex: /"auth_uri"\s*:\s*"https:\/\/accounts\.google\.com\/o\/oauth2\/auth"/g,
    severity: 'critical',
    description: 'Firebase Admin SDK service account JSON detected.',
    redact: false,
    category: 'Google Cloud',
  },
  {
    name: 'Firebase Config (apiKey)',
    regex: /(?:firebaseConfig|initializeApp)\s*\(\s*\{[^}]*apiKey\s*:\s*['"][^'"]+['"]/gs,
    severity: 'high',
    description: 'Firebase configuration object with API key detected.',
    redact: false,
    category: 'Google Cloud',
  },
  {
    name: 'Google Cloud Storage Signed URL',
    regex: /https:\/\/storage\.googleapis\.com\/[^\s'"]*X-Goog-Signature=[a-fA-F0-9]+/g,
    severity: 'high',
    description: 'GCS signed URL detected — grants temporary bucket access.',
    redact: true,
    category: 'Google Cloud',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── AZURE ────────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Azure Subscription ID',
    regex: /(?:subscription[_-]?id|AZURE_SUBSCRIPTION_ID)\s*[:=]\s*['"]?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})['"]?/gi,
    severity: 'medium',
    description: 'Azure subscription ID detected.',
    redact: true,
    category: 'Azure',
  },
  {
    name: 'Azure Client Secret',
    regex: /(?:client[_-]?secret|AZURE_CLIENT_SECRET)\s*[:=]\s*['"]?([a-zA-Z0-9~._\-]{34,})['"]?/gi,
    severity: 'critical',
    description: 'Azure Active Directory client secret detected.',
    redact: true,
    category: 'Azure',
  },
  {
    name: 'Azure Storage Account Key',
    regex: /(?:AccountKey=)([A-Za-z0-9+/=]{86,88}==)/g,
    severity: 'critical',
    description: 'Azure Storage Account key detected — full storage access.',
    redact: true,
    category: 'Azure',
  },
  {
    name: 'Azure SAS Token',
    regex: /(?:sig=)([a-zA-Z0-9%+/=]{40,})/g,
    severity: 'high',
    description: 'Azure Shared Access Signature token detected.',
    redact: true,
    category: 'Azure',
  },
  {
    name: 'Azure Connection String',
    regex: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+;/g,
    severity: 'critical',
    description: 'Azure Storage connection string with credentials detected.',
    redact: true,
    category: 'Azure',
  },
  {
    name: 'Azure Service Bus Connection String',
    regex: /Endpoint=sb:\/\/[^;]+;SharedAccessKeyName=[^;]+;SharedAccessKey=[^'";\s]+/g,
    severity: 'critical',
    description: 'Azure Service Bus connection string detected.',
    redact: true,
    category: 'Azure',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── SOURCE CONTROL ───────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'GitHub PAT (classic)',
    regex: /ghp_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    description: 'GitHub Personal Access Token (classic) detected.',
    redact: true,
    category: 'Source Control',
  },
  {
    name: 'GitHub Fine-Grained PAT',
    regex: /github_pat_[a-zA-Z0-9_]{82}/g,
    severity: 'critical',
    description: 'GitHub Fine-Grained Personal Access Token detected.',
    redact: true,
    category: 'Source Control',
  },
  {
    name: 'GitHub OAuth Token',
    regex: /gho_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    description: 'GitHub OAuth access token detected.',
    redact: true,
    category: 'Source Control',
  },
  {
    name: 'GitHub App Token',
    regex: /(?:ghu|ghs)_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    description: 'GitHub App installation/user token detected.',
    redact: true,
    category: 'Source Control',
  },
  {
    name: 'GitHub Refresh Token',
    regex: /ghr_[a-zA-Z0-9]{76}/g,
    severity: 'critical',
    description: 'GitHub OAuth refresh token detected.',
    redact: true,
    category: 'Source Control',
  },
  {
    name: 'GitLab PAT',
    regex: /glpat-[a-zA-Z0-9\-_]{20}/g,
    severity: 'critical',
    description: 'GitLab Personal Access Token detected.',
    redact: true,
    category: 'Source Control',
  },
  {
    name: 'GitLab Pipeline Trigger Token',
    regex: /glptt-[a-zA-Z0-9]{40}/g,
    severity: 'critical',
    description: 'GitLab Pipeline Trigger Token detected.',
    redact: true,
    category: 'Source Control',
  },
  {
    name: 'GitLab Runner Registration Token',
    regex: /GR1348941[a-zA-Z0-9\-_]{20}/g,
    severity: 'critical',
    description: 'GitLab Runner registration token detected.',
    redact: true,
    category: 'Source Control',
  },
  {
    name: 'Bitbucket App Password',
    regex: /(?:bitbucket[_-]?(?:app[_-]?password|token))\s*[:=]\s*['"]?([a-zA-Z0-9]{20,})['"]?/gi,
    severity: 'critical',
    description: 'Bitbucket App Password detected.',
    redact: true,
    category: 'Source Control',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── CI / CD ──────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'CircleCI Personal API Token',
    regex: /(?:circle[_-]?(?:ci[_-]?)?(?:token|api[_-]?token))\s*[:=]\s*['"]?([a-fA-F0-9]{40})['"]?/gi,
    severity: 'critical',
    description: 'CircleCI API token detected.',
    redact: true,
    category: 'CI/CD',
  },
  {
    name: 'Travis CI Token',
    regex: /(?:travis[_-]?(?:ci[_-]?)?token)\s*[:=]\s*['"]?([a-zA-Z0-9]{22,})['"]?/gi,
    severity: 'critical',
    description: 'Travis CI access token detected.',
    redact: true,
    category: 'CI/CD',
  },
  {
    name: 'Jenkins API Token',
    regex: /(?:jenkins[_-]?(?:api[_-]?)?token)\s*[:=]\s*['"]?([a-fA-F0-9]{34,})['"]?/gi,
    severity: 'critical',
    description: 'Jenkins API token detected.',
    redact: true,
    category: 'CI/CD',
  },
  {
    name: 'Vercel Access Token',
    regex: /(?:VERCEL_TOKEN|vercel[_-]?(?:access[_-]?)?token)\s*[:=]\s*['"]?([a-zA-Z0-9]{24,})['"]?/gi,
    severity: 'critical',
    description: 'Vercel access token detected.',
    redact: true,
    category: 'CI/CD',
  },
  {
    name: 'Netlify Access Token',
    regex: /(?:NETLIFY_AUTH_TOKEN|netlify[_-]?token)\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{40,})['"]?/gi,
    severity: 'critical',
    description: 'Netlify access token detected.',
    redact: true,
    category: 'CI/CD',
  },
  {
    name: 'Render API Key',
    regex: /rnd_[a-zA-Z0-9]{32}/g,
    severity: 'critical',
    description: 'Render.com API key detected.',
    redact: true,
    category: 'CI/CD',
  },
  {
    name: 'Railway Token',
    regex: /(?:RAILWAY_TOKEN|railway[_-]?(?:api[_-]?)?token)\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{32,})['"]?/gi,
    severity: 'critical',
    description: 'Railway.app deployment token detected.',
    redact: true,
    category: 'CI/CD',
  },
  {
    name: 'Fly.io Token',
    regex: /FlyV1 [a-zA-Z0-9+/=]{30,}/g,
    severity: 'critical',
    description: 'Fly.io auth token detected.',
    redact: true,
    category: 'CI/CD',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── COMMUNICATION PLATFORMS ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Slack Bot Token',
    regex: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g,
    severity: 'critical',
    description: 'Slack Bot User OAuth Token detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Slack User Token',
    regex: /xoxp-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[a-fA-F0-9]{32}/g,
    severity: 'critical',
    description: 'Slack User OAuth Token detected — access to all user messages.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Slack App-Level Token',
    regex: /xapp-\d-[A-Z0-9]{10,13}-[0-9]{13}-[a-fA-F0-9]{64}/g,
    severity: 'critical',
    description: 'Slack App-Level Token detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Slack Webhook URL',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g,
    severity: 'high',
    description: 'Slack Incoming Webhook URL detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Discord Bot Token',
    regex: /(?:discord[_-]?(?:bot[_-]?)?token)\s*[:=]\s*['"]?([MN][a-zA-Z0-9]{23,25}\.[a-zA-Z0-9\-_]{6}\.[a-zA-Z0-9\-_]{27,40})['"]?/gi,
    severity: 'critical',
    description: 'Discord bot token detected — full bot account access.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Discord Webhook URL',
    regex: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/[a-zA-Z0-9\-_]{60,68}/g,
    severity: 'high',
    description: 'Discord webhook URL detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Telegram Bot Token',
    regex: /\d{8,10}:AA[a-zA-Z0-9\-_]{33}/g,
    severity: 'critical',
    description: 'Telegram Bot API token detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Twilio Account SID',
    regex: /AC[a-fA-F0-9]{32}/g,
    severity: 'high',
    description: 'Twilio Account SID detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Twilio Auth Token',
    regex: /(?:twilio[_-]?auth[_-]?token|TWILIO_AUTH_TOKEN)\s*[:=]\s*['"]?([a-fA-F0-9]{32})['"]?/gi,
    severity: 'critical',
    description: 'Twilio Auth Token detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Twilio API Key',
    regex: /SK[a-fA-F0-9]{32}/g,
    severity: 'critical',
    description: 'Twilio API Key (SK-prefixed) detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'SendGrid API Key',
    regex: /SG\.[a-zA-Z0-9\-_]{22}\.[a-zA-Z0-9\-_]{43}/g,
    severity: 'critical',
    description: 'SendGrid API key detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Mailchimp API Key',
    regex: /[a-fA-F0-9]{32}-us\d{1,2}/g,
    severity: 'critical',
    description: 'Mailchimp API key detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Mailgun API Key',
    regex: /key-[a-fA-F0-9]{32}/g,
    severity: 'critical',
    description: 'Mailgun API key detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Postmark Server Token',
    regex: /(?:postmark[_-]?(?:server[_-]?)?(?:token|api[_-]?key))\s*[:=]\s*['"]?([a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12})['"]?/gi,
    severity: 'critical',
    description: 'Postmark server API token detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Resend API Key',
    regex: /re_[a-zA-Z0-9]{32,}/g,
    severity: 'critical',
    description: 'Resend email API key detected.',
    redact: true,
    category: 'Communication',
  },
  {
    name: 'Microsoft Teams Webhook',
    regex: /https:\/\/[a-zA-Z0-9]+\.webhook\.office\.com\/webhookb2\/[a-zA-Z0-9\-@]+\/IncomingWebhook\/[a-zA-Z0-9]+\/[a-zA-Z0-9\-]+/g,
    severity: 'high',
    description: 'Microsoft Teams Incoming Webhook URL detected.',
    redact: true,
    category: 'Communication',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── PAYMENT PROVIDERS ───────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Stripe Secret Key (live)',
    regex: /sk_live_[a-zA-Z0-9]{24,}/g,
    severity: 'critical',
    description: 'Stripe live secret key detected — enables financial transactions.',
    redact: true,
    category: 'Payments',
  },
  {
    name: 'Stripe Secret Key (test)',
    regex: /sk_test_[a-zA-Z0-9]{24,}/g,
    severity: 'medium',
    description: 'Stripe test secret key detected.',
    redact: true,
    category: 'Payments',
  },
  {
    name: 'Stripe Publishable Key (live)',
    regex: /pk_live_[a-zA-Z0-9]{24,}/g,
    severity: 'high',
    description: 'Stripe live publishable key detected.',
    redact: true,
    category: 'Payments',
  },
  {
    name: 'Stripe Webhook Secret',
    regex: /whsec_[a-zA-Z0-9]{32,}/g,
    severity: 'critical',
    description: 'Stripe webhook signing secret detected — allows request forgery.',
    redact: true,
    category: 'Payments',
  },
  {
    name: 'Stripe Restricted Key',
    regex: /rk_live_[a-zA-Z0-9]{24,}/g,
    severity: 'critical',
    description: 'Stripe restricted live API key detected.',
    redact: true,
    category: 'Payments',
  },
  {
    name: 'PayPal Client Secret',
    regex: /(?:paypal[_-]?(?:client[_-]?)?secret|PAYPAL_SECRET)\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{40,})['"]?/gi,
    severity: 'critical',
    description: 'PayPal client secret detected.',
    redact: true,
    category: 'Payments',
  },
  {
    name: 'Razorpay Key Secret',
    regex: /rzp_(?:live|test)_[a-zA-Z0-9]{14}/g,
    severity: 'critical',
    description: 'Razorpay API key detected.',
    redact: true,
    category: 'Payments',
  },
  {
    name: 'Braintree Access Token',
    regex: /access_token\$(?:production|sandbox)\$[a-z0-9]{16}\$[a-fA-F0-9]{32}/g,
    severity: 'critical',
    description: 'Braintree access token detected.',
    redact: true,
    category: 'Payments',
  },
  {
    name: 'Square Access Token',
    regex: /(?:sq0atp|sq0csp)-[a-zA-Z0-9\-_]{22,43}/g,
    severity: 'critical',
    description: 'Square payment access token detected.',
    redact: true,
    category: 'Payments',
  },
  {
    name: 'Adyen API Key',
    regex: /AQE[a-zA-Z0-9+/=]{20,}/g,
    severity: 'critical',
    description: 'Adyen API key detected.',
    redact: true,
    category: 'Payments',
  },
  {
    name: 'Paddle API Key',
    regex: /(?:paddle[_-]?(?:api[_-]?)?(?:key|token))\s*[:=]\s*['"]?([a-zA-Z0-9]{40,})['"]?/gi,
    severity: 'critical',
    description: 'Paddle API key detected.',
    redact: true,
    category: 'Payments',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── DATABASES ───────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Database Connection String (generic)',
    regex: /(?:mongodb(?:\+srv)?|postgresql|postgres|mysql|mariadb|redis|mssql|sqlserver|oracle|cockroachdb|cassandra|couchdb|neo4j):\/\/[^\s'"<>]+:[^\s'"<>@]+@[^\s'"<>]+/gi,
    severity: 'critical',
    description: 'Database connection string with embedded credentials detected.',
    redact: true,
    category: 'Databases',
  },
  {
    name: 'Supabase Service Role Key',
    regex: /(?:SUPABASE_SERVICE_ROLE_KEY|supabase[_-]?service[_-]?(?:role[_-]?)?key)\s*[:=]\s*['"]?(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})['"]?/gi,
    severity: 'critical',
    description: 'Supabase service role key detected — bypasses Row Level Security.',
    redact: true,
    category: 'Databases',
  },
  {
    name: 'Supabase Anon Key',
    regex: /(?:SUPABASE_ANON_KEY|supabase[_-]?anon[_-]?key)\s*[:=]\s*['"]?(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})['"]?/gi,
    severity: 'medium',
    description: 'Supabase anonymous key detected — exposes your API publicly.',
    redact: true,
    category: 'Databases',
  },
  {
    name: 'PlanetScale Database URL',
    regex: /mysql:\/\/[^:]+:[a-zA-Z0-9_\-+/=]{20,}@[^/]*\.psdb\.cloud/g,
    severity: 'critical',
    description: 'PlanetScale database connection URL with credentials detected.',
    redact: true,
    category: 'Databases',
  },
  {
    name: 'Neon Database URL',
    regex: /postgres(?:ql)?:\/\/[^:]+:[a-zA-Z0-9_\-+/=]{20,}@[^/]*\.neon\.tech/g,
    severity: 'critical',
    description: 'Neon serverless Postgres URL with credentials detected.',
    redact: true,
    category: 'Databases',
  },
  {
    name: 'MongoDB Atlas Connection String',
    regex: /mongodb\+srv:\/\/[^\s'"<>]+:[^\s'"<>@]+@[^\s'"<>]+\.mongodb\.net/g,
    severity: 'critical',
    description: 'MongoDB Atlas connection string with credentials detected.',
    redact: true,
    category: 'Databases',
  },
  {
    name: 'Turso Database URL',
    regex: /libsql:\/\/[^\s'"]+\.turso\.io/g,
    severity: 'high',
    description: 'Turso (libSQL) database URL detected.',
    redact: true,
    category: 'Databases',
  },
  {
    name: 'Turso Auth Token',
    regex: /(?:TURSO_AUTH_TOKEN|turso[_-]?(?:auth[_-]?)?token)\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{40,})['"]?/gi,
    severity: 'critical',
    description: 'Turso database auth token detected.',
    redact: true,
    category: 'Databases',
  },
  {
    name: 'Upstash Redis URL',
    regex: /rediss?:\/\/[^:]+:[a-zA-Z0-9]{30,}@[^\s'"]+\.upstash\.io/g,
    severity: 'critical',
    description: 'Upstash Redis URL with credentials detected.',
    redact: true,
    category: 'Databases',
  },
  {
    name: 'Upstash REST Token',
    regex: /(?:UPSTASH_REDIS_REST_TOKEN|upstash[_-]?(?:redis[_-]?)?(?:rest[_-]?)?token)\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{40,})['"]?/gi,
    severity: 'critical',
    description: 'Upstash Redis REST API token detected.',
    redact: true,
    category: 'Databases',
  },
  {
    name: 'Airtable API Key',
    regex: /pat[a-zA-Z0-9]{14}\.[a-fA-F0-9]{64}/g,
    severity: 'critical',
    description: 'Airtable Personal Access Token detected.',
    redact: true,
    category: 'Databases',
  },
  {
    name: 'Pinecone API Key',
    regex: /(?:PINECONE_API_KEY|pinecone[_-]?(?:api[_-]?)?key)\s*[:=]\s*['"]?([a-fA-F0-9\-]{36,})['"]?/gi,
    severity: 'critical',
    description: 'Pinecone vector database API key detected.',
    redact: true,
    category: 'Databases',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── MONITORING & OBSERVABILITY ──────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Datadog API Key',
    regex: /(?:DD_API_KEY|datadog[_-]?api[_-]?key)\s*[:=]\s*['"]?([a-fA-F0-9]{32})['"]?/gi,
    severity: 'critical',
    description: 'Datadog API key detected.',
    redact: true,
    category: 'Monitoring',
  },
  {
    name: 'Datadog App Key',
    regex: /(?:DD_APP_KEY|datadog[_-]?app[_-]?key)\s*[:=]\s*['"]?([a-fA-F0-9]{40})['"]?/gi,
    severity: 'critical',
    description: 'Datadog Application key detected.',
    redact: true,
    category: 'Monitoring',
  },
  {
    name: 'Sentry DSN',
    regex: /https:\/\/[a-fA-F0-9]{32}@(?:o\d+\.)?sentry\.io\/\d+/g,
    severity: 'medium',
    description: 'Sentry DSN detected — exposes your Sentry project and org.',
    redact: true,
    category: 'Monitoring',
  },
  {
    name: 'Sentry Auth Token',
    regex: /(?:SENTRY_AUTH_TOKEN|sentry[_-]?auth[_-]?token)\s*[:=]\s*['"]?([a-fA-F0-9]{64})['"]?/gi,
    severity: 'critical',
    description: 'Sentry authentication token detected.',
    redact: true,
    category: 'Monitoring',
  },
  {
    name: 'New Relic License Key',
    regex: /(?:NEW_RELIC_LICENSE_KEY|newrelic[_-]?license[_-]?key)\s*[:=]\s*['"]?([a-fA-F0-9]{40}|NRAK-[a-zA-Z0-9]{42})['"]?/gi,
    severity: 'critical',
    description: 'New Relic license key detected.',
    redact: true,
    category: 'Monitoring',
  },
  {
    name: 'Logflare API Key',
    regex: /(?:LOGFLARE_API_KEY|logflare[_-]?(?:api[_-]?)?key)\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{36,})['"]?/gi,
    severity: 'high',
    description: 'Logflare API key detected.',
    redact: true,
    category: 'Monitoring',
  },
  {
    name: 'Grafana API Token',
    regex: /glsa_[a-zA-Z0-9]{32}_[a-fA-F0-9]{8}/g,
    severity: 'critical',
    description: 'Grafana Service Account Token detected.',
    redact: true,
    category: 'Monitoring',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── AUTH / IDENTITY PROVIDERS ───────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Auth0 Client Secret',
    regex: /(?:AUTH0_CLIENT_SECRET|auth0[_-]?client[_-]?secret)\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{40,})['"]?/gi,
    severity: 'critical',
    description: 'Auth0 client secret detected.',
    redact: true,
    category: 'Auth & Identity',
  },
  {
    name: 'Auth0 Management API Token',
    regex: /(?:AUTH0_MANAGEMENT_TOKEN|auth0[_-]?(?:mgmt|management)[_-]?token)\s*[:=]\s*['"]?(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})['"]?/gi,
    severity: 'critical',
    description: 'Auth0 Management API token detected — full user/app management access.',
    redact: true,
    category: 'Auth & Identity',
  },
  {
    name: 'Clerk Secret Key',
    regex: /sk_(?:live|test)_[a-zA-Z0-9]{40,}/g,
    severity: 'critical',
    description: 'Clerk.dev secret key detected.',
    redact: true,
    category: 'Auth & Identity',
  },
  {
    name: 'Okta API Token',
    regex: /(?:OKTA_API_TOKEN|okta[_-]?(?:api[_-]?)?token)\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{40,})['"]?/gi,
    severity: 'critical',
    description: 'Okta API token detected.',
    redact: true,
    category: 'Auth & Identity',
  },
  {
    name: 'JWT Token',
    regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    severity: 'high',
    description: 'JSON Web Token (JWT) detected — may contain auth claims.',
    redact: true,
    category: 'Auth & Identity',
  },
  {
    name: 'NextAuth Secret',
    regex: /(?:NEXTAUTH_SECRET|nextauth[_-]?secret)\s*[:=]\s*['"]?([a-zA-Z0-9+/=_\-]{20,})['"]?/gi,
    severity: 'critical',
    description: 'NextAuth.js session secret detected — allows session forgery.',
    redact: true,
    category: 'Auth & Identity',
  },
  {
    name: 'Better Auth Secret',
    regex: /(?:BETTER_AUTH_SECRET|better[_-]?auth[_-]?secret)\s*[:=]\s*['"]?([a-zA-Z0-9+/=_\-]{20,})['"]?/gi,
    severity: 'critical',
    description: 'Better Auth secret detected.',
    redact: true,
    category: 'Auth & Identity',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── CRYPTO / WEB3 ───────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Ethereum Private Key',
    regex: /(?:0x)?[a-fA-F0-9]{64}(?=\b)/g,
    severity: 'critical',
    description: 'Potential Ethereum/EVM private key detected — full wallet control.',
    redact: true,
    category: 'Crypto / Web3',
  },
  {
    name: 'BIP39 Mnemonic Phrase',
    regex: /\b(?:(?:abandon|ability|able|about|above|absent|absorb|abstract|absurd|abuse|access|accident|account|accuse|achieve|acid|acoustic|acquire|across|act|action|actor|actress|actual|adapt|add|addict|address|adjust|admit|adult|advance|advice|aerobic|afford|afraid|again|age|agent|agree|ahead|aim|air|airport|aisle|alarm|album|alcohol|alert|alien|all|alley|allow|almost|alone|alpha|already|also|alter|always|amateur|amazing|among|amount|amused|analyst|anchor|ancient|anger|angle|angry|animal|ankle|announce|annual|another|answer|antenna|antique|anxiety|any|apart|apology|appear|apple|approve|april|arch|arctic|area|arena|argue|arm|armed|armor|army|around|arrange|arrest|arrive|arrow|art|artefact|artist|artwork|ask|aspect|assault|asset|assist|assume|asthma|athlete|atom|attack|attend|attitude|attract|auction|audit|august|aunt|author|auto|autumn|average|avocado|avoid|awake|aware|away|awesome|awful|awkward|axis)\b[\s,]+){11,23}(?:abandon|ability|able|about|above|absent|absorb|abstract|absurd|abuse|access|accident|account|accuse|achieve|acid|acoustic|acquire|across|act|action|actor|actress|actual|adapt|add|addict|address|adjust|admit|adult|advance|advice|aerobic|afford|afraid|again|age|agent|agree|ahead|aim|air|airport|aisle|alarm|album|alcohol|alert|alien|all|alley|allow|almost|alone|alpha|already|also|alter|always|amateur|amazing|among|amount|amused|analyst|anchor|ancient|anger|angle|angry|animal|ankle|announce|annual|another|answer|antenna|antique|anxiety|any|apart|apology|appear|apple|approve|april|arch|arctic|area|arena|argue|arm|armed|armor|army|around|arrange|arrest|arrive|arrow|art|artefact|artist|artwork|ask|aspect|assault|asset|assist|assume|asthma|athlete|atom|attack|attend|attitude|attract|auction|audit|august|aunt|author|auto|autumn|average|avocado|avoid|awake|aware|away|awesome|awful|awkward|axis)\b/gi,
    severity: 'critical',
    description: 'BIP39 seed phrase fragment detected — grants full wallet recovery access.',
    redact: true,
    category: 'Crypto / Web3',
  },
  {
    name: 'Alchemy API Key',
    regex: /(?:ALCHEMY_API_KEY|alchemy[_-]?(?:api[_-]?)?key)\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{32,})['"]?/gi,
    severity: 'critical',
    description: 'Alchemy blockchain node API key detected.',
    redact: true,
    category: 'Crypto / Web3',
  },
  {
    name: 'Infura API Key',
    regex: /(?:INFURA_API_KEY|infura[_-]?(?:project[_-]?)?(?:id|secret|key))\s*[:=]\s*['"]?([a-fA-F0-9]{32})['"]?/gi,
    severity: 'critical',
    description: 'Infura Ethereum node API key detected.',
    redact: true,
    category: 'Crypto / Web3',
  },
  {
    name: 'QuickNode Endpoint',
    regex: /https:\/\/[a-z0-9\-]+\.quiknode\.pro\/[a-fA-F0-9]{48,}\//g,
    severity: 'critical',
    description: 'QuickNode RPC endpoint with API key detected.',
    redact: true,
    category: 'Crypto / Web3',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── INFRASTRUCTURE & NETWORKING ─────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Cloudflare API Token',
    regex: /(?:CF_API_TOKEN|cloudflare[_-]?(?:api[_-]?)?token)\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{40})['"]?/gi,
    severity: 'critical',
    description: 'Cloudflare API token detected — DNS, WAF, and CDN control.',
    redact: true,
    category: 'Infrastructure',
  },
  {
    name: 'Cloudflare Global API Key',
    regex: /(?:CF_API_KEY|cloudflare[_-]?global[_-]?(?:api[_-]?)?key)\s*[:=]\s*['"]?([a-fA-F0-9]{37})['"]?/gi,
    severity: 'critical',
    description: 'Cloudflare Global API Key detected.',
    redact: true,
    category: 'Infrastructure',
  },
  {
    name: 'Cloudflare Workers KV Namespace',
    regex: /(?:CLOUDFLARE_KV_NAMESPACE_ID|kv[_-]?namespace[_-]?id)\s*[:=]\s*['"]?([a-fA-F0-9]{32})['"]?/gi,
    severity: 'medium',
    description: 'Cloudflare KV Namespace ID detected.',
    redact: true,
    category: 'Infrastructure',
  },
  {
    name: 'DigitalOcean Personal Access Token',
    regex: /dop_v1_[a-fA-F0-9]{64}/g,
    severity: 'critical',
    description: 'DigitalOcean Personal Access Token detected.',
    redact: true,
    category: 'Infrastructure',
  },
  {
    name: 'Linode / Akamai Cloud Token',
    regex: /(?:linode|LINODE)[_-]?(?:token|api[_-]?key)\s*[:=]\s*['"]?([a-fA-F0-9]{64})['"]?/gi,
    severity: 'critical',
    description: 'Linode/Akamai Cloud API token detected.',
    redact: true,
    category: 'Infrastructure',
  },
  {
    name: 'Terraform Cloud Token',
    regex: /(?:TFC_TOKEN|terraform[_-]?(?:cloud[_-]?)?token)\s*[:=]\s*['"]?([a-zA-Z0-9]{14}\.atlasv1\.[a-zA-Z0-9]{60,})['"]?/gi,
    severity: 'critical',
    description: 'Terraform Cloud API token detected.',
    redact: true,
    category: 'Infrastructure',
  },
  {
    name: 'HashiCorp Vault Token',
    regex: /(?:VAULT_TOKEN|vault[_-]?token)\s*[:=]\s*['"]?((?:hvs|s)\.[a-zA-Z0-9]{24,})['"]?/gi,
    severity: 'critical',
    description: 'HashiCorp Vault token detected.',
    redact: true,
    category: 'Infrastructure',
  },
  {
    name: 'Doppler Service Token',
    regex: /dp\.st\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9]{40,}/g,
    severity: 'critical',
    description: 'Doppler secrets manager service token detected.',
    redact: true,
    category: 'Infrastructure',
  },
  {
    name: 'Pulumi Access Token',
    regex: /pul-[a-fA-F0-9]{40}/g,
    severity: 'critical',
    description: 'Pulumi access token detected.',
    redact: true,
    category: 'Infrastructure',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── PACKAGE REGISTRIES ──────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'npm Access Token',
    regex: /(?:NPM_TOKEN|npm[_-]?(?:auth[_-]?)?token)\s*[:=]\s*['"]?(npm_[a-zA-Z0-9]{36})['"]?/gi,
    severity: 'critical',
    description: 'npm publish/read access token detected.',
    redact: true,
    category: 'Package Registries',
  },
  {
    name: 'PyPI API Token',
    regex: /pypi-AgEIcHlwaS5vcmc[a-zA-Z0-9\-_]{50,}/g,
    severity: 'critical',
    description: 'PyPI package upload API token detected.',
    redact: true,
    category: 'Package Registries',
  },
  {
    name: 'RubyGems API Key',
    regex: /rubygems_[a-fA-F0-9]{48}/g,
    severity: 'critical',
    description: 'RubyGems API key detected.',
    redact: true,
    category: 'Package Registries',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── SOCIAL & DEVELOPER APIS ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Twitter/X Bearer Token',
    regex: /AAAA[a-zA-Z0-9%]{80,}/g,
    severity: 'critical',
    description: 'Twitter/X API Bearer Token detected.',
    redact: true,
    category: 'Social APIs',
  },
  {
    name: 'Twitter/X Consumer Secret',
    regex: /(?:twitter[_-]?(?:consumer[_-]?)?(?:api[_-]?)?secret|TWITTER_SECRET)\s*[:=]\s*['"]?([a-zA-Z0-9]{50})['"]?/gi,
    severity: 'critical',
    description: 'Twitter/X API Consumer Secret detected.',
    redact: true,
    category: 'Social APIs',
  },
  {
    name: 'Facebook App Secret',
    regex: /(?:facebook[_-]?(?:app[_-]?)?secret|FB_APP_SECRET)\s*[:=]\s*['"]?([a-fA-F0-9]{32})['"]?/gi,
    severity: 'critical',
    description: 'Facebook / Meta App Secret detected.',
    redact: true,
    category: 'Social APIs',
  },
  {
    name: 'Instagram Access Token',
    regex: /(?:instagram[_-]?(?:access[_-]?)?token)\s*[:=]\s*['"]?([0-9]{8,}[a-zA-Z0-9]{30,})['"]?/gi,
    severity: 'critical',
    description: 'Instagram Graph API access token detected.',
    redact: true,
    category: 'Social APIs',
  },
  {
    name: 'LinkedIn Client Secret',
    regex: /(?:linkedin[_-]?(?:client[_-]?)?secret)\s*[:=]\s*['"]?([a-zA-Z0-9]{16})['"]?/gi,
    severity: 'critical',
    description: 'LinkedIn OAuth client secret detected.',
    redact: true,
    category: 'Social APIs',
  },
  {
    name: 'Shopify Admin API Key',
    regex: /shpat_[a-fA-F0-9]{32}/g,
    severity: 'critical',
    description: 'Shopify Admin API access token detected.',
    redact: true,
    category: 'Social APIs',
  },
  {
    name: 'Shopify Partner API Key',
    regex: /shppa_[a-fA-F0-9]{32}/g,
    severity: 'critical',
    description: 'Shopify Partner API token detected.',
    redact: true,
    category: 'Social APIs',
  },
  {
    name: 'Figma Personal Access Token',
    regex: /figd_[a-zA-Z0-9\-_]{40,}/g,
    severity: 'high',
    description: 'Figma Personal Access Token detected.',
    redact: true,
    category: 'Social APIs',
  },
  {
    name: 'Notion API Secret',
    regex: /secret_[a-zA-Z0-9]{43}/g,
    severity: 'critical',
    description: 'Notion integration secret detected.',
    redact: true,
    category: 'Social APIs',
  },
  {
    name: 'Linear API Key',
    regex: /lin_api_[a-zA-Z0-9]{40}/g,
    severity: 'critical',
    description: 'Linear.app API key detected.',
    redact: true,
    category: 'Social APIs',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── PRIVATE KEYS & CERTIFICATES ─────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'PEM Private Key',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'PEM-encoded private key block detected.',
    redact: false,
    category: 'Keys & Certs',
  },
  {
    name: 'PEM Certificate (with key context)',
    regex: /-----BEGIN CERTIFICATE-----/g,
    severity: 'medium',
    description: 'PEM certificate block detected — may include chain or sensitive cert.',
    redact: false,
    category: 'Keys & Certs',
  },
  {
    name: 'SSH Private Key (OpenSSH)',
    regex: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'OpenSSH private key detected.',
    redact: false,
    category: 'Keys & Certs',
  },
  {
    name: 'PGP Private Key',
    regex: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
    severity: 'critical',
    description: 'PGP private key block detected.',
    redact: false,
    category: 'Keys & Certs',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── HARDCODED SECRETS (GENERIC) ─────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Generic Password Assignment',
    regex: /(?:password|passwd|pwd|secret|pass)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    severity: 'high',
    description: 'Hardcoded password or secret string detected.',
    redact: true,
    category: 'Generic Secrets',
  },
  {
    name: 'Generic API Key Assignment',
    regex: /(?:api[_-]?key|auth[_-]?token|access[_-]?token|bearer[_-]?token|secret[_-]?key)\s*[:=]\s*['"][a-zA-Z0-9+/=_\-]{20,}['"]/gi,
    severity: 'high',
    description: 'Hardcoded API key or token assignment detected.',
    redact: true,
    category: 'Generic Secrets',
  },
  {
    name: 'Basic Auth in URL',
    regex: /https?:\/\/[a-zA-Z0-9_%+\-.]+:[a-zA-Z0-9_%+\-.]{6,}@[a-zA-Z0-9\-.]+/g,
    severity: 'critical',
    description: 'Credentials embedded in a URL (Basic Auth) detected.',
    redact: true,
    category: 'Generic Secrets',
  },
  {
    name: '.env File Contents',
    regex: /^[A-Z][A-Z0-9_]{3,}=(?!false|true|0|1|null|undefined|localhost|\d+$).{10,}/gm,
    severity: 'high',
    description: 'Possible .env file contents with secrets detected.',
    redact: true,
    category: 'Generic Secrets',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── UNSAFE CODE PATTERNS ────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'eval() Call',
    regex: /\beval\s*\(/g,
    severity: 'medium',
    description: '`eval()` executes arbitrary strings as code — a common XSS vector.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'innerHTML Assignment',
    regex: /\.innerHTML\s*[+]?=/g,
    severity: 'medium',
    description: '`innerHTML` assignment can introduce XSS if content is user-supplied.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'document.write()',
    regex: /document\.write\s*\(/g,
    severity: 'medium',
    description: '`document.write()` is deprecated and can lead to XSS.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'outerHTML Assignment',
    regex: /\.outerHTML\s*[+]?=/g,
    severity: 'medium',
    description: '`outerHTML` assignment may allow DOM injection.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'dangerouslySetInnerHTML (React)',
    regex: /dangerouslySetInnerHTML\s*=\s*\{\s*\{[^}]*__html\s*:/g,
    severity: 'medium',
    description: 'React `dangerouslySetInnerHTML` usage — potential XSS if unsanitized.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'setTimeout with String',
    regex: /setTimeout\s*\(\s*['"`]/g,
    severity: 'low',
    description: '`setTimeout` with a string argument is equivalent to `eval()`.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'setInterval with String',
    regex: /setInterval\s*\(\s*['"`]/g,
    severity: 'low',
    description: '`setInterval` with a string argument is equivalent to `eval()`.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'Function Constructor',
    regex: /new\s+Function\s*\(/g,
    severity: 'medium',
    description: '`new Function(...)` dynamically evaluates code — similar risk to eval.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'Shell Execution with User Input (Node.js)',
    regex: /(?:execSync|spawnSync|exec|spawn)\s*\([^)]*(?:req\.|process\.argv|process\.env)/g,
    severity: 'high',
    description: 'Shell execution using user-controlled or env input detected.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'Python subprocess with shell=True',
    regex: /subprocess\.(?:call|run|Popen)\s*\([^)]*shell\s*=\s*True/g,
    severity: 'high',
    description: 'Python subprocess called with `shell=True` — command injection risk.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'Python os.system() Call',
    regex: /\bos\.system\s*\(/g,
    severity: 'medium',
    description: '`os.system()` executes shell commands — potential injection vector.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'Unsafe Deserialization',
    regex: /(?:unserialize|yaml\.load|pickle\.loads?|marshal\.loads?|jsonpickle\.decode)\s*\(/g,
    severity: 'high',
    description: 'Unsafe deserialization call detected — may allow RCE.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: '__proto__ Pollution',
    regex: /\.__proto__\s*=/g,
    severity: 'high',
    description: 'Prototype pollution via `__proto__` assignment detected.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'Prototype Pollution (constructor)',
    regex: /\.constructor\.prototype\s*=/g,
    severity: 'high',
    description: 'Prototype pollution via `constructor.prototype` detected.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'SQL String Concatenation',
    regex: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE)\s+.{0,60}\+\s*(?:req\.|request\.|params\.|query\.|body\.|user\.|input)/gi,
    severity: 'high',
    description: 'Potential SQL injection via string concatenation with user input.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'Path Traversal',
    regex: /(?:readFile|readFileSync|createReadStream|open)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/g,
    severity: 'high',
    description: 'File read using user-controlled path — potential directory traversal.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'SSRF-Prone fetch/axios with User Input',
    regex: /(?:fetch|axios\.get|axios\.post|http\.get|https\.get)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/g,
    severity: 'high',
    description: 'Outbound HTTP request with user-controlled URL — SSRF risk.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'Disabled TLS/SSL Verification',
    regex: /(?:rejectUnauthorized\s*:\s*false|verify\s*=\s*False|ssl_verify\s*=\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0['"]?)/gi,
    severity: 'high',
    description: 'TLS/SSL certificate verification disabled — MITM attack risk.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'Hardcoded Cryptographic Key (hex)',
    regex: /(?:key|iv|nonce|salt)\s*[:=]\s*(?:0x)?['"]?[a-fA-F0-9]{32,}['"]?/gi,
    severity: 'high',
    description: 'Hardcoded cryptographic key, IV, or nonce detected.',
    redact: true,
    category: 'Unsafe Code',
  },
  {
    name: 'Weak Hashing Algorithm',
    regex: /(?:createHash|hashlib\.new)\s*\(\s*['"](?:md5|sha1)['"]/gi,
    severity: 'medium',
    description: 'Weak cryptographic hash function (MD5/SHA-1) used — prefer SHA-256+.',
    redact: false,
    category: 'Unsafe Code',
  },
  {
    name: 'Math.random() for Security',
    regex: /Math\.random\(\)(?=.*(?:token|secret|key|auth|password|nonce|id))/gi,
    severity: 'medium',
    description: '`Math.random()` is not cryptographically secure — use `crypto.randomUUID()` or `crypto.getRandomValues()`.',
    redact: false,
    category: 'Unsafe Code',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── PII / SENSITIVE DATA ────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'Social Security Number (US)',
    regex: /\b(?!000|666|9\d{2})\d{3}[-\s](?!00)\d{2}[-\s](?!0000)\d{4}\b/g,
    severity: 'critical',
    description: 'US Social Security Number (SSN) detected.',
    redact: true,
    category: 'PII',
  },
  {
    name: 'Credit Card Number',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|(?:5[1-5][0-9]{2}|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g,
    severity: 'critical',
    description: 'Credit card number pattern detected.',
    redact: true,
    category: 'PII',
  },
  {
    name: 'IBAN (Bank Account)',
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g,
    severity: 'high',
    description: 'IBAN bank account number pattern detected.',
    redact: true,
    category: 'PII',
  },
  {
    name: 'Indian Aadhaar Number',
    regex: /\b[2-9]{1}[0-9]{3}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g,
    severity: 'critical',
    description: 'Indian Aadhaar number pattern detected.',
    redact: true,
    category: 'PII',
  },
  {
    name: 'Indian PAN Number',
    regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,
    severity: 'high',
    description: 'Indian PAN (tax) number pattern detected.',
    redact: true,
    category: 'PII',
  },
  {
    name: 'UK National Insurance Number',
    regex: /\b(?!BG|GB|NK|KN|TN|NT|ZZ)(?:[A-CEGHJ-PR-TW-Z]{1}[A-CEGHJ-NPR-TW-Z]{1})\d{6}[ABCD]\b/gi,
    severity: 'critical',
    description: 'UK National Insurance Number (NINO) detected.',
    redact: true,
    category: 'PII',
  },
  {
    name: 'IP Address (Internal RFC1918)',
    regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
    severity: 'low',
    description: 'Internal (RFC1918) IP address detected — reveals network topology.',
    redact: false,
    category: 'PII',
  },
];

/**
 * Returns line number (1-indexed) for a match at `index` within `text`.
 */
function getLineNumber(text: string, index: number): number {
  const slice = text.substring(0, index);
  return slice.split('\n').length;
}

/**
 * Redacts a sensitive match string, preserving only the first 4 and last 4 chars.
 */
function redactMatch(match: string): string {
  if (match.length <= 12) {
    return '*'.repeat(match.length);
  }
  return `${match.substring(0, 4)}${'*'.repeat(Math.min(match.length - 8, 20))}${match.substring(match.length - 4)}`;
}

/**
 * Truncates a match string for safe display (max 60 chars).
 */
function truncateMatch(match: string): string {
  const cleaned = match.replace(/\s+/g, ' ').trim();
  return cleaned.length > 60 ? cleaned.substring(0, 57) + '...' : cleaned;
}

export interface ScanOptions {
  ignoredPatterns?: string[];
  maxResults?: number;
  categories?: string[];  // Filter to specific categories only
}

/**
 * Scans `text` against all registered patterns.
 * Returns at most one DetectionResult per pattern (first match wins) to avoid spam.
 * Designed to run in < 50 ms for typical clipboard content (≤ 5 KB).
 */
export function scanContent(text: string, options: ScanOptions = {}): DetectionResult[] {
  const { ignoredPatterns = [], maxResults = 50, categories } = options;
  const results: DetectionResult[] = [];

  for (const def of PATTERN_DEFINITIONS) {
    if (results.length >= maxResults) {
      break;
    }
    if (ignoredPatterns.includes(def.name)) {
      continue;
    }
    if (categories && !categories.includes(def.category)) {
      continue;
    }

    // Re-create regex from source to avoid lastIndex state issues with /g flag
    const flags = def.regex.flags.includes('g') ? def.regex.flags : def.regex.flags + 'g';
    const regex = new RegExp(def.regex.source, flags);
    const match = regex.exec(text);

    if (match) {
      const rawMatch = match[0];
      const displayMatch = def.redact ? redactMatch(rawMatch) : truncateMatch(rawMatch);

      results.push({
        type: def.name,
        description: def.description,
        match: displayMatch,
        severity: def.severity,
        line: getLineNumber(text, match.index),
        category: def.category,
      });
    }
  }

  // Sort: critical → high → medium → low
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  results.sort((a, b) => order[a.severity] - order[b.severity]);

  return results;
}

/**
 * Returns all unique categories in the pattern registry.
 */
export function getCategories(): string[] {
  return [...new Set(PATTERN_DEFINITIONS.map(p => p.category))];
}

export { PATTERN_DEFINITIONS };
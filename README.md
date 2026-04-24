# Dev Toolkit

Dev Toolkit is a VS Code extension with essential developer utilities.

## Features

- **File Size Viewer** - Display individual file sizes with human-readable formatting in a status bar
- **Explorer Size Decorations** - View file and folder sizes directly in the Explorer with tooltips showing size and file count
- **Console Log Remover** - Remove all `console.*` statements from JavaScript/TypeScript files or selected text
- **Unused Import Remover** - Remove unused imports in JavaScript/TypeScript files with one command
- **One-Click Project Cleanup** - Run common hygiene fixes in one action: remove `console.*`, remove unused imports, and trim trailing whitespace
- **Function Reference Tracker** - Locate and display references to functions across your workspace for fast navigation and analysis
- **Code Explainer** - Explain selected code with an AI-enhanced view panel and an editor command for quick context-aware insights
- **Read Time Estimator** - Show estimated read time for JavaScript, TypeScript, and Markdown files in the status bar
- **Code Style Mood** - Real-time code style assessment with mood badges (God-level, Clean, Neat, Messy) displayed in the status bar. Analyzes line length, naming conventions, comments, and function complexity with hover tooltips for detailed feedback
- **Coding Session Tracker**
    - Track deep-work sessions with a live sidebar dashboard featuring four tabs. 
      - **Today** shows active time, session count, best focus streak, flow time, a responsive 12-week activity heatmap, and all-time lifetime stats. 
      - **Goals** sets a custom daily coding goal with an animated progress ring and estimated completion time. 
      - **Awards** tracks 20 achievements across five categories (Milestones, Streaks, Flow State, Productivity, Time of Day) plus four progressive badges (Code Clock, Fire Keeper, Focus Forge, Iron Coder) each with Bronze through Diamond tiers. 
      - **History** displays a 14-session bar chart with per-session breakdowns of duration, active time, peak streak, and efficiency, plus JSON and CSV export. Includes idle detection, pause/resume tracking, and a live efficiency strip that updates in real time.
- **PasteShield**
    - Intercepts clipboard paste operations and scans content for secrets, credentials, and unsafe code patterns before committing text to the document. Surfaces a non-blocking warning with **Paste Anyway / Show Details / Cancel** options, plus a two-step modal confirmation after reviewing details.
      - **Pattern Detection** covers 80+ patterns across 15 categories: AI providers (OpenAI, Anthropic, Gemini, Groq, Hugging Face, Replicate, and more), AWS (all key prefixes, session tokens, ARNs, pre-signed URLs), Google Cloud & Firebase, Azure (storage, Service Bus, SAS tokens), source control (all GitHub token types, GitLab, Bitbucket), CI/CD (Vercel, Netlify, Render, Railway, Fly.io), communication platforms (Slack, Discord, Telegram, Twilio, Resend, Mailchimp), payments (Stripe, Razorpay, Braintree, Square, Adyen, Paddle), databases (Supabase, PlanetScale, Neon, MongoDB Atlas, Turso, Upstash, Pinecone), auth providers (Auth0, Clerk, Okta, NextAuth), crypto/Web3 (Ethereum private keys, BIP39 mnemonics, Alchemy, Infura), private keys & certificates (PEM, OpenSSH, PGP), and PII (SSN, credit cards, IBAN, Aadhaar, PAN, UK NIN).
    
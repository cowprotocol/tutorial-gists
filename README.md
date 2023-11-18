# Tutorial gists

Gists:

1. Gaslessly submit an ERC-1271 signed order from a Safe with a single owner.

## Usage

This project uses `pnpm` for package management. Install dependencies:

```bash
pnpm i
```

To run the current gist, copy the `.env.example` to `.env` and populate `PRIVATE_KEY` and `RPC_URL` respectively.

```bash
source .env
npx run src/index
```
"""
$MIND Token Airdrop — send initial allocation to new citizens.

Uses Solana RPC (via Helius) to transfer $MIND tokens from the
deployer wallet to a citizen's wallet.

The deployer wallet private key is at .keys/org/solana_deployer.json
(Solana CLI format: JSON array of 64 bytes).

Usage:
    from runtime.l4.mind_token_airdrop import airdrop_mind

    result = airdrop_mind(
        recipient_address="7cRzx...",
        amount=100.0,  # $MIND
    )
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger("l4.airdrop")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
KEYS_DIR = PROJECT_ROOT / ".keys"

MIND_MINT = os.environ.get(
    "MIND_MINT",
    "EgLGfRrjX3du7Pwbj8dzyubSk8ic1WdDfq1ysLqhBm6p",
)
MIND_DECIMALS = int(os.environ.get("MIND_DECIMALS", "9"))
INITIAL_ALLOCATION = float(os.environ.get("MIND_INITIAL_ALLOCATION", "100"))

HELIUS_RPC = os.environ.get(
    "HELIUS_RPC_URL",
    os.environ.get("SOLANA_RPC_URL", "https://mainnet.helius-rpc.com/?api-key=4c3a5fc2-ea3f-45eb-85d5-2f282a6b4401"),
)


def airdrop_mind(
    recipient_address: str,
    amount: float = INITIAL_ALLOCATION,
    deployer_key_path: str = "",
) -> dict:
    """Transfer $MIND tokens from deployer wallet to recipient.

    Args:
        recipient_address: Solana public key (base58) of the recipient
        amount: Amount of $MIND to send (default: 100)
        deployer_key_path: Path to deployer private key JSON. Defaults to
                          .keys/org/solana_deployer.json

    Returns:
        dict with status, tx_signature, amount, recipient
    """
    if not recipient_address:
        return {"status": "error", "detail": "No recipient address"}

    deployer_path = Path(deployer_key_path) if deployer_key_path else KEYS_DIR / "org" / "solana_deployer.json"
    if not deployer_path.exists():
        logger.warning(f"Deployer wallet not found at {deployer_path} — airdrop skipped")
        return {
            "status": "skipped",
            "detail": f"Deployer wallet not found at {deployer_path}",
            "recipient": recipient_address,
            "amount": amount,
        }

    try:
        from solders.keypair import Keypair
        from solders.pubkey import Pubkey
        from solders.transaction import Transaction
        from solders.system_program import TransferParams, transfer
        from solders.message import Message
        import httpx

        # Load deployer keypair
        secret = json.loads(deployer_path.read_text())
        deployer = Keypair.from_bytes(bytes(secret))
        deployer_pubkey = deployer.pubkey()

        recipient_pubkey = Pubkey.from_string(recipient_address)
        mint_pubkey = Pubkey.from_string(MIND_MINT)

        # Amount in raw units
        raw_amount = int(amount * (10 ** MIND_DECIMALS))

        # Get deployer's associated token account for $MIND
        deployer_ata = _get_associated_token_address(deployer_pubkey, mint_pubkey)
        recipient_ata = _get_associated_token_address(recipient_pubkey, mint_pubkey)

        # Build SPL token transfer instruction
        from spl.token.instructions import transfer_checked, TransferCheckedParams

        transfer_ix = transfer_checked(TransferCheckedParams(
            program_id=Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
            source=deployer_ata,
            mint=mint_pubkey,
            dest=recipient_ata,
            owner=deployer_pubkey,
            amount=raw_amount,
            decimals=MIND_DECIMALS,
        ))

        # Get recent blockhash
        resp = httpx.post(HELIUS_RPC, json={
            "jsonrpc": "2.0", "id": 1,
            "method": "getLatestBlockhash",
            "params": [{"commitment": "finalized"}],
        }, timeout=10.0)
        blockhash = resp.json()["result"]["value"]["blockhash"]

        # Build and sign transaction
        from solders.hash import Hash
        msg = Message.new_with_blockhash(
            [transfer_ix],
            deployer_pubkey,
            Hash.from_string(blockhash),
        )
        tx = Transaction.new_unsigned(msg)
        tx.sign([deployer], Hash.from_string(blockhash))

        # Send
        tx_bytes = bytes(tx)
        import base64
        tx_b64 = base64.b64encode(tx_bytes).decode()

        send_resp = httpx.post(HELIUS_RPC, json={
            "jsonrpc": "2.0", "id": 1,
            "method": "sendTransaction",
            "params": [tx_b64, {"encoding": "base64"}],
        }, timeout=15.0)

        result = send_resp.json()
        if "result" in result:
            sig = result["result"]
            logger.info(f"Airdrop {amount} $MIND → {recipient_address[:12]}... tx={sig[:12]}...")
            return {
                "status": "sent",
                "tx_signature": sig,
                "amount": amount,
                "recipient": recipient_address,
            }
        else:
            error = result.get("error", {})
            logger.warning(f"Airdrop failed: {error}")
            return {
                "status": "error",
                "detail": str(error),
                "recipient": recipient_address,
                "amount": amount,
            }

    except ImportError as e:
        logger.info(f"Solana libraries not installed — airdrop skipped ({e})")
        return {
            "status": "skipped",
            "detail": f"Solana libraries not installed: {e}",
            "recipient": recipient_address,
            "amount": amount,
        }
    except Exception as e:
        logger.warning(f"Airdrop failed for {recipient_address}: {e}")
        return {
            "status": "error",
            "detail": str(e),
            "recipient": recipient_address,
            "amount": amount,
        }


def _get_associated_token_address(owner: "Pubkey", mint: "Pubkey") -> "Pubkey":
    """Derive the associated token account address."""
    from solders.pubkey import Pubkey
    ASSOCIATED_TOKEN_PROGRAM = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
    TOKEN_PROGRAM = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")

    seeds = [bytes(owner), bytes(TOKEN_PROGRAM), bytes(mint)]
    ata, _ = Pubkey.find_program_address(seeds, ASSOCIATED_TOKEN_PROGRAM)
    return ata

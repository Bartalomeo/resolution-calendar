// USDT Contract Addresses per chain
export const USDT_CONTRACTS: Record<string, string> = {
  ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  base: '0xf6A78083ca3e2a862D9502F63925F19e674b43C7B',
  polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58eF',
  arbitrum: '0xFd086bC7CD5C481DCC9C96eBB6Aa3b8E2B8dA8eE',
};

// RPC endpoints (public, no key required)
export const RPC_URLS: Record<string, string> = {
  ethereum: 'https://eth.public-rpc.com',
  base: 'https://base.public-rpc.com',
  polygon: 'https://polygon-rpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
};

export const CHAIN_NAMES: Record<string, string> = {
  ethereum: 'Ethereum',
  base: 'Base',
  polygon: 'Polygon',
  arbitrum: 'Arbitrum',
};

export const CHAIN_CURRENCIES: Record<string, string> = {
  ethereum: 'USDT (ERC-20)',
  base: 'USDT (Base)',
  polygon: 'USDT (Polygon)',
  arbitrum: 'USDT (Arbitrum)',
};

// ERC-20 Transfer function selector (keccak256('transfer(address,uint256)')[:4])
const TRANSFER_SELECTOR = '0xa9059cbb';

export const PLANS = {
  free: {
    name: 'Free',
    priceUsdt: 0,
    features: ['Up to 5 markets in watchlist', 'Free Telegram bot', '24h resolution alerts'],
  },
  pro: {
    name: 'Pro',
    priceUsdt: 4.99, // $4.99/month
    features: ['Unlimited watchlist', 'Priority Telegram alerts', '48h resolution alerts', 'Daily email digest'],
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export interface PaymentRecord {
  ref: string;
  userId: string;
  plan: PlanKey;
  chain: string;
  address: string; // merchant address (user's wallet)
  amount: string; // in USDT units (smallest unit = 1e6 for USDT)
  currency: string;
  status: 'pending' | 'confirmed' | 'expired';
  txHash?: string;
  createdAt: string;
  expiresAt: string; // 30 min from creation
}

export interface TxVerifyResult {
  valid: boolean;
  error?: string;
  txHash?: string;
  fromAddress?: string;
  toAddress?: string;
  amount?: string; // in USDT units
  confirmations?: number;
}

async function rpcCall<T>(chain: string, method: string, params: any[] = []): Promise<T> {
  const rpcUrl = RPC_URLS[chain];
  if (!rpcUrl) throw new Error(`Unknown chain: ${chain}`);

  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

export async function getTxReceipt(chain: string, txHash: string): Promise<any> {
  return rpcCall(chain, 'eth_getTransactionReceipt', [txHash]);
}

export async function getTxByHash(chain: string, txHash: string): Promise<any> {
  return rpcCall(chain, 'eth_getTransactionByHash', [txHash]);
}

export async function getBlockNumber(chain: string): Promise<string> {
  return rpcCall(chain, 'eth_blockNumber', []);
}

// Decode ERC-20 transfer data
// Input data: 0xa9059cbb + address (32 bytes, padded) + amount (32 bytes, padded)
function decodeTransferInput(data: string): { to: string; amount: string } | null {
  if (!data || data.length < 10) return null;
  const selector = data.slice(0, 10).toLowerCase();
  if (selector !== TRANSFER_SELECTOR) return null;

  // Skip '0x' + selector (4 bytes = 8 hex chars)
  const rest = data.slice(10);

  // address: next 32 bytes (64 hex chars), last 20 bytes = address
  const addressHex = '0x' + rest.slice(24, 64);
  // amount: last 32 bytes
  const amountHex = rest.slice(64, 128);

  return {
    to: addressHex.toLowerCase(),
    amount: BigInt('0x' + amountHex).toString(),
  };
}

export async function verifyUsdtTx(
  chain: string,
  txHash: string,
  merchantAddress: string,
  expectedAmount: string // USDT units (e.g. "50000000" for $50)
): Promise<TxVerifyResult> {
  try {
    // Get transaction
    const tx = await getTxByHash(chain, txHash);
    if (!tx) {
      return { valid: false, error: 'Transaction not found' };
    }

    const toAddress = tx.to?.toLowerCase();
    const usdtContract = USDT_CONTRACTS[chain]?.toLowerCase();

    // Check if tx is to USDT contract
    if (toAddress !== usdtContract) {
      return { valid: false, error: `Not a USDT transfer (got ${toAddress})` };
    }

    // Decode transfer data
    const decoded = decodeTransferInput(tx.input || '');
    if (!decoded) {
      return { valid: false, error: 'Could not decode transfer data' };
    }

    // Verify recipient
    if (decoded.to !== merchantAddress.toLowerCase()) {
      return { valid: false, error: `Wrong recipient (expected ${merchantAddress}, got ${decoded.to})` };
    }

    // Verify amount (USDT has 6 decimals)
    const sentAmount = BigInt(decoded.amount);
    const minAmount = BigInt(expectedAmount);
    if (sentAmount < minAmount) {
      return { valid: false, error: `Amount too low: ${sentAmount} < ${minAmount}` };
    }

    // Check confirmations
    const receipt = await getTxReceipt(chain, txHash);
    if (!receipt) {
      return { valid: false, error: 'Transaction receipt not found' };
    }

    const confirmations = receipt.confirmations
      ? parseInt(receipt.confirmations, 16)
      : 0;

    return {
      valid: true,
      txHash,
      fromAddress: tx.from,
      toAddress: decoded.to,
      amount: decoded.amount,
      confirmations,
    };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Verification failed' };
  }
}

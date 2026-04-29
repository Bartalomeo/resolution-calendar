export interface Market {
  id: string;
  question: string;
  slug: string;
  description: string;
  markets: MarketDetails[];
  outcomes: string[];
  outcomePrices: string[];
  creator: string;
  creationTime: number;
  endDate: string;
  gameStartTime: number;
  active: boolean;
  closed: boolean;
  archived: boolean;
  acceptingOrders: boolean;
  volume: number;
  liquidity: number;
  price: string;
  awardAccount: string;
  awardDate: string;
  acceptingOrderTimestamp: number;
  conditionId: string;
  questionId: string;
  // Gamma-specific
  title?: string;
  tags?: string[];
  categories?: string[];
  image?: string;
  updatedAt?: number;
  createdAt?: number;
  clobTokenIds?: string[];
  condition?: string;
  negRisk?: boolean;
 _vol?: number;
}

export interface MarketDetails {
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  acceptingOrderTimestamp: number;
  conditionId: string;
  endDate: string;
  id: string;
  marketMakerFee: number;
  takerFee: number;
  condition: string;
  questionId: string;
  questionsHash: string;
  slug: string;
  title: string;
  gameStartTime: number;
  marketType: string;
}

export interface WatchlistItem {
  marketId: string;
  addedAt: number;
  notifyBefore: number; // minutes
  telegramChatId?: string;
}

export interface UserPreferences {
  chatId: string;
  username: string;
  notifyBefore: number;
  categories: string[];
  minVolume: number;
}

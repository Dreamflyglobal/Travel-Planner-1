// Frontend Storage Layer - Persistent data management without backend
// All data is stored in localStorage for persistence across sessions

export interface Booking {
  id: string;
  userId: string;
  type: 'flight' | 'hotel' | 'bus' | 'package';
  status: 'confirmed' | 'pending' | 'cancelled';
  bookingDate: string;
  travelDate: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  details: any; // Specific booking details (flight/hotel/bus info)
  paymentMethod: 'card' | 'upi' | 'wallet' | 'emi';
  emiDetails?: {
    tenure: number; // months
    monthlyAmount: number;
    processingFee: number;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  wallet: number;
  referralCode: string;
  referredBy?: string;
  joinedDate: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  timestamp: string;
  bookingId?: string;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredUserId: string;
  referralCode: string;
  bonus: number;
  status: 'pending' | 'completed';
  timestamp: string;
}

export interface Offer {
  id: string;
  title: string;
  description: string;
  discount: number; // percentage or flat amount
  discountType: 'percentage' | 'flat';
  code: string;
  validFrom: string;
  validTo: string;
  minAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  applicableFor: string[]; // ['flight', 'hotel', 'bus', 'package']
  active: boolean;
}

export interface Analytics {
  totalBookings: number;
  totalRevenue: number;
  bookingsByType: {
    flight: number;
    hotel: number;
    bus: number;
    package: number;
  };
  revenueByType: {
    flight: number;
    hotel: number;
    bus: number;
    package: number;
  };
  bookingsByMonth: {
    [key: string]: number;
  };
  revenueByMonth: {
    [key: string]: number;
  };
  topDestinations: Array<{ name: string; count: number }>;
  walletBalance: number;
  totalUsers: number;
  activeOffers: number;
  referralEarnings: number;
}

// Storage Keys
const KEYS = {
  BOOKINGS: 'travel_bookings',
  USERS: 'travel_users',
  CURRENT_USER: 'travel_current_user',
  WALLET_TRANSACTIONS: 'travel_wallet_transactions',
  REFERRALS: 'travel_referrals',
  OFFERS: 'travel_offers',
  ANALYTICS: 'travel_analytics',
};

// Helper to generate unique IDs
export const generateId = () => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper to generate referral code
export const generateReferralCode = (name: string) => {
  return `${name.substr(0, 3).toUpperCase()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
};

// ==================== BOOKINGS ====================

export const saveBooking = (booking: Omit<Booking, 'id' | 'bookingDate'>): Booking => {
  const bookings = getBookings();
  const newBooking: Booking = {
    ...booking,
    id: generateId(),
    bookingDate: new Date().toISOString(),
  };
  bookings.push(newBooking);
  localStorage.setItem(KEYS.BOOKINGS, JSON.stringify(bookings));
  updateAnalytics();
  return newBooking;
};

export const getBookings = (): Booking[] => {
  const data = localStorage.getItem(KEYS.BOOKINGS);
  return data ? JSON.parse(data) : [];
};

export const getBookingById = (id: string): Booking | null => {
  const bookings = getBookings();
  return bookings.find(b => b.id === id) || null;
};

export const getBookingsByUser = (userId: string): Booking[] => {
  return getBookings().filter(b => b.userId === userId);
};

export const cancelBooking = (id: string): boolean => {
  const bookings = getBookings();
  const index = bookings.findIndex(b => b.id === id);
  if (index !== -1) {
    bookings[index].status = 'cancelled';
    localStorage.setItem(KEYS.BOOKINGS, JSON.stringify(bookings));
    updateAnalytics();
    return true;
  }
  return false;
};

// ==================== USERS ====================

export const createUser = (data: Omit<User, 'id' | 'wallet' | 'referralCode' | 'joinedDate'>): User => {
  const users = getUsers();
  const newUser: User = {
    ...data,
    id: generateId(),
    wallet: 0,
    referralCode: generateReferralCode(data.name),
    joinedDate: new Date().toISOString(),
  };
  users.push(newUser);
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  setCurrentUser(newUser);
  updateAnalytics();
  return newUser;
};

export const getUsers = (): User[] => {
  const data = localStorage.getItem(KEYS.USERS);
  return data ? JSON.parse(data) : [];
};

export const getUserById = (id: string): User | null => {
  const users = getUsers();
  return users.find(u => u.id === id) || null;
};

export const getUserByReferralCode = (code: string): User | null => {
  const users = getUsers();
  return users.find(u => u.referralCode === code) || null;
};

export const getCurrentUser = (): User | null => {
  const data = localStorage.getItem(KEYS.CURRENT_USER);
  return data ? JSON.parse(data) : null;
};

export const setCurrentUser = (user: User | null) => {
  if (user) {
    localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(KEYS.CURRENT_USER);
  }
};

export const updateUserWallet = (userId: string, amount: number, description: string, type: 'credit' | 'debit', bookingId?: string): boolean => {
  const users = getUsers();
  const index = users.findIndex(u => u.id === userId);
  if (index !== -1) {
    const newBalance = type === 'credit' ? users[index].wallet + amount : users[index].wallet - amount;
    if (newBalance < 0) return false; // Insufficient balance
    
    users[index].wallet = newBalance;
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    
    // Update current user if it's the same
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === userId) {
      setCurrentUser(users[index]);
    }
    
    // Add wallet transaction
    addWalletTransaction({
      userId,
      type,
      amount,
      description,
      bookingId,
    });
    
    return true;
  }
  return false;
};

// ==================== WALLET TRANSACTIONS ====================

export const addWalletTransaction = (data: Omit<WalletTransaction, 'id' | 'timestamp'>): WalletTransaction => {
  const transactions = getWalletTransactions();
  const newTransaction: WalletTransaction = {
    ...data,
    id: generateId(),
    timestamp: new Date().toISOString(),
  };
  transactions.push(newTransaction);
  localStorage.setItem(KEYS.WALLET_TRANSACTIONS, JSON.stringify(transactions));
  return newTransaction;
};

export const getWalletTransactions = (): WalletTransaction[] => {
  const data = localStorage.getItem(KEYS.WALLET_TRANSACTIONS);
  return data ? JSON.parse(data) : [];
};

export const getWalletTransactionsByUser = (userId: string): WalletTransaction[] => {
  return getWalletTransactions().filter(t => t.userId === userId);
};

// ==================== REFERRALS ====================

export const createReferral = (referrerId: string, referredUserId: string, referralCode: string): Referral => {
  const referrals = getReferrals();
  const newReferral: Referral = {
    id: generateId(),
    referrerId,
    referredUserId,
    referralCode,
    bonus: 500, // ₹500 bonus for referrer
    status: 'completed',
    timestamp: new Date().toISOString(),
  };
  referrals.push(newReferral);
  localStorage.setItem(KEYS.REFERRALS, JSON.stringify(referrals));
  
  // Credit referral bonus to referrer's wallet
  updateUserWallet(referrerId, 500, 'Referral bonus', 'credit');
  
  // Credit signup bonus to new user's wallet
  updateUserWallet(referredUserId, 200, 'Signup bonus', 'credit');
  
  updateAnalytics();
  return newReferral;
};

export const getReferrals = (): Referral[] => {
  const data = localStorage.getItem(KEYS.REFERRALS);
  return data ? JSON.parse(data) : [];
};

export const getReferralsByUser = (userId: string): Referral[] => {
  return getReferrals().filter(r => r.referrerId === userId);
};

// ==================== OFFERS ====================

export const createOffer = (data: Omit<Offer, 'id' | 'usedCount'>): Offer => {
  const offers = getOffers();
  const newOffer: Offer = {
    ...data,
    id: generateId(),
    usedCount: 0,
  };
  offers.push(newOffer);
  localStorage.setItem(KEYS.OFFERS, JSON.stringify(offers));
  updateAnalytics();
  return newOffer;
};

export const getOffers = (): Offer[] => {
  const data = localStorage.getItem(KEYS.OFFERS);
  return data ? JSON.parse(data) : [];
};

export const getActiveOffers = (): Offer[] => {
  const now = new Date().toISOString();
  return getOffers().filter(o => 
    o.active && 
    o.validFrom <= now && 
    o.validTo >= now &&
    (!o.usageLimit || o.usedCount < o.usageLimit)
  );
};

export const getOfferByCode = (code: string): Offer | null => {
  const offers = getActiveOffers();
  return offers.find(o => o.code.toUpperCase() === code.toUpperCase()) || null;
};

export const applyOffer = (code: string, amount: number, type: string): number => {
  const offer = getOfferByCode(code);
  if (!offer) return 0;
  
  if (!offer.applicableFor.includes(type)) return 0;
  if (offer.minAmount && amount < offer.minAmount) return 0;
  
  let discount = 0;
  if (offer.discountType === 'percentage') {
    discount = (amount * offer.discount) / 100;
    if (offer.maxDiscount) {
      discount = Math.min(discount, offer.maxDiscount);
    }
  } else {
    discount = offer.discount;
  }
  
  // Update usage count
  const offers = getOffers();
  const index = offers.findIndex(o => o.id === offer.id);
  if (index !== -1) {
    offers[index].usedCount++;
    localStorage.setItem(KEYS.OFFERS, JSON.stringify(offers));
  }
  
  return discount;
};

// ==================== ANALYTICS ====================

export const updateAnalytics = () => {
  const bookings = getBookings();
  const users = getUsers();
  const offers = getActiveOffers();
  const referrals = getReferrals();
  
  const analytics: Analytics = {
    totalBookings: bookings.filter(b => b.status !== 'cancelled').length,
    totalRevenue: bookings.filter(b => b.status !== 'cancelled').reduce((sum, b) => sum + b.amount, 0),
    bookingsByType: {
      flight: bookings.filter(b => b.type === 'flight' && b.status !== 'cancelled').length,
      hotel: bookings.filter(b => b.type === 'hotel' && b.status !== 'cancelled').length,
      bus: bookings.filter(b => b.type === 'bus' && b.status !== 'cancelled').length,
      package: bookings.filter(b => b.type === 'package' && b.status !== 'cancelled').length,
    },
    revenueByType: {
      flight: bookings.filter(b => b.type === 'flight' && b.status !== 'cancelled').reduce((sum, b) => sum + b.amount, 0),
      hotel: bookings.filter(b => b.type === 'hotel' && b.status !== 'cancelled').reduce((sum, b) => sum + b.amount, 0),
      bus: bookings.filter(b => b.type === 'bus' && b.status !== 'cancelled').reduce((sum, b) => sum + b.amount, 0),
      package: bookings.filter(b => b.type === 'package' && b.status !== 'cancelled').reduce((sum, b) => sum + b.amount, 0),
    },
    bookingsByMonth: {},
    revenueByMonth: {},
    topDestinations: [],
    walletBalance: users.reduce((sum, u) => sum + u.wallet, 0),
    totalUsers: users.length,
    activeOffers: offers.length,
    referralEarnings: referrals.reduce((sum, r) => sum + r.bonus, 0),
  };
  
  // Group by month
  bookings.filter(b => b.status !== 'cancelled').forEach(booking => {
    const month = new Date(booking.bookingDate).toISOString().substring(0, 7); // YYYY-MM
    analytics.bookingsByMonth[month] = (analytics.bookingsByMonth[month] || 0) + 1;
    analytics.revenueByMonth[month] = (analytics.revenueByMonth[month] || 0) + booking.amount;
  });
  
  localStorage.setItem(KEYS.ANALYTICS, JSON.stringify(analytics));
  return analytics;
};

export const getAnalytics = (): Analytics => {
  const data = localStorage.getItem(KEYS.ANALYTICS);
  if (!data) {
    return updateAnalytics();
  }
  return JSON.parse(data);
};

// ==================== INITIALIZATION ====================

export const initializeDefaultData = () => {
  // Initialize with default offers if none exist
  if (getOffers().length === 0) {
    const today = new Date();
    const nextMonth = new Date(today.setMonth(today.getMonth() + 1));
    
    createOffer({
      title: 'Welcome Offer',
      description: 'Get 20% off on your first booking',
      discount: 20,
      discountType: 'percentage',
      code: 'WELCOME20',
      validFrom: new Date().toISOString(),
      validTo: nextMonth.toISOString(),
      minAmount: 1000,
      maxDiscount: 500,
      applicableFor: ['flight', 'hotel', 'bus', 'package'],
      active: true,
    });
    
    createOffer({
      title: 'Weekend Special',
      description: '₹300 off on weekend bookings',
      discount: 300,
      discountType: 'flat',
      code: 'WEEKEND300',
      validFrom: new Date().toISOString(),
      validTo: nextMonth.toISOString(),
      minAmount: 2000,
      applicableFor: ['flight', 'hotel'],
      active: true,
    });
  }
  
  // Initialize analytics if not exists
  if (!localStorage.getItem(KEYS.ANALYTICS)) {
    updateAnalytics();
  }
};

// ==================== CLEAR ALL DATA (For Testing) ====================

export const clearAllData = () => {
  Object.values(KEYS).forEach(key => localStorage.removeItem(key));
};

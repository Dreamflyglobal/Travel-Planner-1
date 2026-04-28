/**
 * Utility functions to help debug and migrate booking data in sessionStorage
 */

const STORAGE_KEY = 'msw_mock_bookings';

/**
 * Get all bookings from sessionStorage
 */
export function getAllBookings() {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading bookings:', error);
    return [];
  }
}

/**
 * Save bookings to sessionStorage
 */
export function saveBookings(bookings: any[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    return true;
  } catch (error) {
    console.error('Error saving bookings:', error);
    return false;
  }
}

/**
 * Clear all bookings from sessionStorage
 */
export function clearAllBookings() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing bookings:', error);
    return false;
  }
}

/**
 * Debug: Log all bookings to console
 */
export function debugBookings() {
  const bookings = getAllBookings();
  console.log('📦 Total Bookings:', bookings.length);
  bookings.forEach((booking: any, index: number) => {
    console.log(`\n[${index}] Booking Details:`);
    console.log('  ID:', booking.id);
    console.log('  Booking ID:', booking.bookingId);
    console.log('  Reference ID:', booking.referenceId);
    console.log('  Type:', booking.type || booking.bookingType);
    console.log('  Title:', booking.title);
    console.log('  Status:', booking.status || booking.paymentStatus);
    console.log('  User ID:', booking.userId);
    console.log('  Has title in details?:', !!booking.details?.title);
    console.log('  Full booking:', booking);
  });
  return bookings;
}

/**
 * Migrate old bookings to add missing title field
 */
export function migrateBookingTitles() {
  const bookings = getAllBookings();
  let migrated = 0;
  
  const updatedBookings = bookings.map((booking: any) => {
    // If booking already has a title, skip it
    if (booking.title && booking.title.trim() !== '') {
      return booking;
    }
    
    // Generate title based on booking type
    let generatedTitle = '';
    const bookingType = booking.type || booking.bookingType || 'package';
    const id = booking.id || booking.referenceId || booking.bookingId;
    
    if (bookingType === 'hotel') {
      generatedTitle = `Hotel Booking #${id}`;
    } else if (bookingType === 'flight') {
      generatedTitle = `Flight Booking #${id}`;
    } else if (bookingType === 'bus') {
      generatedTitle = `Bus Booking #${id}`;
    } else {
      generatedTitle = `${bookingType.charAt(0).toUpperCase() + bookingType.slice(1)} Booking #${id}`;
    }
    
    migrated++;
    
    return {
      ...booking,
      title: generatedTitle,
      details: {
        ...booking.details,
        title: generatedTitle,
      }
    };
  });
  
  if (migrated > 0) {
    saveBookings(updatedBookings);
  }
  
  return { migrated, total: bookings.length };
}

/**
 * Expose debug functions to window in development only
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).bookingDebug = {
    getAll: getAllBookings,
    save: saveBookings,
    clear: clearAllBookings,
    debug: debugBookings,
    migrate: migrateBookingTitles,
  };
}

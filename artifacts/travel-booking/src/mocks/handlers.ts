// Mock API handlers for local development without backend
import { http, HttpResponse, passthrough } from 'msw';

// In-memory mock database with localStorage persistence
const STORAGE_KEY = 'msw_mock_bookings';
const USERS_STORAGE_KEY = 'msw_mock_users';

// Load bookings from localStorage on initialization
function loadBookings(): any[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const bookings = JSON.parse(stored);
      // Migration: Fix bookings with null or invalid IDs
    let nextId = 1;
    const migratedBookings = bookings.map((booking: any) => {
      if (!booking.id || booking.id === null || booking.id === 'null') {
        // Extract ID from bookingId if possible (e.g., BKG-3 -> 3)
        if (booking.bookingId && typeof booking.bookingId === 'string') {
          const match = booking.bookingId.match(/\d+/);
          if (match) {
            const extractedId = parseInt(match[0]);
            return { ...booking, id: extractedId };
          }
        }
        // Fallback: generate a new ID
        const newId = nextId++;
        return { ...booking, id: newId, bookingId: booking.bookingId || `BKG-${newId}` };
      }
      return booking;
    });
    
    // Save migrated bookings back
    if (migratedBookings.some((b: any, i: number) => b.id !== bookings[i].id)) {
      saveBookings(migratedBookings);
    }
    
    return migratedBookings;
  } catch (error) {
    console.error('Error loading bookings:', error);
    return [];
  }
}

// Save bookings to localStorage
function saveBookings(bookings: any[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  } catch (error) {
    // Silent fail
  }
}

// Initialize mock database from localStorage
let mockBookings: any[] = loadBookings();

// ─── Mock users store ─────────────────────────────────────────────────────────

function loadMockUsers(): any[] {
  try {
    const stored = localStorage.getItem(USERS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveMockUsers(users: any[]) {
  try { localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users)); } catch { /**/ }
}

let mockUsers: any[] = loadMockUsers();

/**
 * Find an existing mock user by phone or email.
 * If neither matches, create a new one.
 * Returns the user record (always has an id).
 */
function findOrCreateMockUser(phone: string | null, email: string | null, name: string): any {
  const cleanPhone = phone?.trim() || null;
  const cleanEmail = email?.trim().toLowerCase() || null;

  // Try phone first
  if (cleanPhone) {
    const found = mockUsers.find((u: any) => u.phone && u.phone.trim() === cleanPhone);
    if (found) return found;
  }
  // Try email
  if (cleanEmail) {
    const found = mockUsers.find((u: any) => u.email && u.email.trim().toLowerCase() === cleanEmail);
    if (found) return found;
  }
  // Create new
  const newUser = {
    id: `mock_user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name || 'Guest',
    phone: cleanPhone,
    email: cleanEmail,
    role: 'user',
    createdAt: new Date().toISOString(),
  };
  mockUsers.push(newUser);
  saveMockUsers(mockUsers);
  console.log('🆕 MSW: Auto-created user', newUser.id, 'phone=', cleanPhone, 'email=', cleanEmail);
  return newUser;
}

// ─────────────────────────────────────────────────────────────────────────────

export const handlers = [
  // Health check
  http.get('/api/healthz', () => {
    return HttpResponse.json({ status: 'ok', timestamp: new Date().toISOString() }, { status: 200 });
  }),
  // GET /api/bookings - Get all bookings (optionally filtered by ?userId= or ?phone=)
  http.get('/api/bookings', ({ request }) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const phone  = url.searchParams.get('phone')?.trim() || null;

    let result = mockBookings;

    if (userId || phone) {
      // Resolve userId from phone if needed
      let resolvedUserId: string | null = userId;
      if (!resolvedUserId && phone) {
        const user = mockUsers.find((u: any) => u.phone && u.phone.trim() === phone);
        if (user) resolvedUserId = String(user.id);
      }

      result = mockBookings.filter((b: any) => {
        const matchUserId = resolvedUserId && String(b.userId) === String(resolvedUserId);
        const matchPhone  = phone && (b.passengerPhone?.trim() === phone || b.customerPhone?.trim() === phone);
        return matchUserId || matchPhone;
      });
    }

    return HttpResponse.json(result, { status: 200 });
  }),// GET /api/bookings/:id - Get specific booking
  http.get('/api/bookings/:id', ({ params }) => {
    const { id } = params;
    console.log('🔍 MSW: Looking for booking with ID:', id);
    console.log('📦 Available bookings:', mockBookings.map(b => ({ 
      id: b.id, 
      type: typeof b.id,
      bookingId: b.bookingId,
      referenceId: b.referenceId
    })));
      const booking = mockBookings.find((b) => {
      // Try multiple comparison methods
      const idStr = id?.toString() || '';
      const match = b.id === id || 
                    b.id === parseInt(id as string) || 
                    b.id?.toString() === idStr ||
                    b.bookingId === idStr ||
                    b.referenceId === idStr;
      console.log(`  Comparing booking.id=${b.id} (${typeof b.id}) with url.id=${id} (${typeof id}): ${match}`);
      return match;
    });
    
    if (!booking) {
      console.log('❌ MSW: Booking not found for ID:', id);
      return HttpResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }
    
    console.log('✅ MSW: Found booking:', booking);
    return HttpResponse.json(booking, { status: 200 });
  }),// POST /api/bookings - Create new booking
  http.post('/api/bookings', async ({ request }) => {
    const body = await request.json() as any;
    
    console.log('🔵 MSW: Creating new booking with body:', body);
    
    // Extract data from the nested structure if it exists
    const bookingData = body.data || body;
    const details = bookingData.details || {};
    
    // Generate a unique ID - ensure it's always valid
    const existingIds = mockBookings
      .map(b => {
        if (typeof b.id === 'number') return b.id;
        if (typeof b.id === 'string') {
          const parsed = parseInt(b.id);
          return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
      })
      .filter(id => id > 0);
    
    const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
    
    console.log('🔢 MSW: Generated new ID:', newId, 'from existing IDs:', existingIds);
    
    // ── Auto user lookup / creation ──────────────────────────────────────────
    const incomingUserId = details.userId || bookingData.userId || '';
    let userId: string;

    if (incomingUserId && incomingUserId !== 'guest' && incomingUserId !== '') {
      // Authenticated user — trust the provided userId
      userId = String(incomingUserId);
    } else {
      // Guest — find or create by phone/email
      const passengerPhone = bookingData.passengerPhone || details.customerPhone || null;
      const passengerEmail = bookingData.passengerEmail || details.customerEmail || null;
      const passengerName  = bookingData.passengerName  || details.customerName  || 'Guest';
      const user = findOrCreateMockUser(passengerPhone, passengerEmail, passengerName);
      userId = String(user.id);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Agent fields — passed from passenger-details-page when user.role === "agent"
    const agentId       = bookingData.agentId       || details.agentId       || null;
    const agentCode     = bookingData.agentCode     || details.agentCode     || null;
    const agentEmail    = bookingData.agentEmail    || details.agentEmail    || null;
    const commissionEarned = bookingData.commissionEarned ?? details.commissionEarned ?? 0;

    // Create the booking with proper flattened structure
    const newBooking = {
      id: newId,
      bookingId: `BKG-${newId}`,
      type: bookingData.bookingType,
      bookingType: bookingData.bookingType,
      referenceId: bookingData.referenceId,
      status: details.status || 'confirmed',
      userId: userId,
      
      // Passenger info (both formats for compatibility)
      passengerName: bookingData.passengerName,
      customerName: details.customerName || bookingData.passengerName,
      passengerEmail: bookingData.passengerEmail,
      customerEmail: details.customerEmail || bookingData.passengerEmail,
      passengerPhone: bookingData.passengerPhone,
      customerPhone: details.customerPhone || bookingData.passengerPhone,
      customerGender: details.customerGender,
      
      // Agent fields — stored at top-level so admin/dashboard queries find them
      agentId,
      agentCode,
      agentEmail,
      commissionEarned,
      
      // Booking details
      passengers: bookingData.passengers,
      passengerDetails: details.passengerDetails || [],
      selectedSeats: details.selectedSeats || details.busInfo?.seats || [],
      travelDate: bookingData.travelDate,
      
      // Payment info
      amount: details.amount || 0,
      totalAmount: details.amount || 0,
      totalPrice: details.amount || 0,
      paymentMethod: details.paymentMethod,
      paymentId: details.paymentId,
      paymentStatus: details.status || 'paid',
      emiDetails: details.emiTenure ? {
        tenure: details.emiTenure,
        monthlyAmount: Math.ceil((details.amount || 0) / details.emiTenure)
      } : undefined,
      
      // Metadata
      title: bookingData.title || `${bookingData.bookingType} booking`,
      createdAt: details.createdAt || new Date().toISOString(),
      bookingDate: details.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      // Bus-specific top-level fields (extracted from details.busInfo)
      busOperator:      details.busInfo?.operator      || undefined,
      busType:          details.busInfo?.busType        || undefined,
      busFrom:          details.busInfo?.from           || undefined,
      busTo:            details.busInfo?.to             || undefined,
      busBoardingPoint: details.busInfo?.boarding_point || undefined,
      busDroppingPoint: details.busInfo?.dropping_point || undefined,
      busDeparture:     details.busInfo?.departure      || undefined,
      busArrival:       details.busInfo?.arrival        || undefined,
      busBaseFare:      details.busInfo ? details.baseAmount : undefined,
      busConvFee:       details.busInfo ? details.convenience_fee : undefined,

      // Hotel-specific top-level fields (extracted from details.hotelInfo)
      hotelName:   details.hotelInfo?.hotel_name || undefined,
      hotelCity:   details.hotelInfo?.city       || undefined,
      hotelNights: details.hotelInfo?.nights     || undefined,
      hotelRooms:  details.hotelInfo?.rooms      || 1,
      hotelAdults: details.hotelInfo?.guests     || undefined,
      roomType:    details.hotelInfo?.room_type  || undefined,
      checkoutDate: details.hotelInfo?.checkout  || undefined,

      // Flight-specific top-level fields (extracted from details.flightInfo)
      flightAirline:   details.flightInfo?.airline                                    || undefined,
      flightNumber:    details.flightInfo?.flightNumber || details.flightInfo?.flightNum || undefined,
      flightFrom:      details.flightInfo?.from          || undefined,
      flightTo:        details.flightInfo?.to            || undefined,
      flightDeparture: details.flightInfo?.departure     || undefined,
      flightArrival:   details.flightInfo?.arrival       || undefined,
      flightDuration:  details.flightInfo?.duration      || undefined,
      flightBaseFare:  details.flightInfo ? (details.baseAmount || undefined) : undefined,
      flightConvFee:   details.flightInfo ? (details.convenienceFee || undefined) : undefined,
      flightBaggageKg: details.flightInfo ? (details.extraBaggageKg || undefined) : undefined,
      flightBaggageCost: details.flightInfo ? (details.extraBaggageCost || undefined) : undefined,
      discount:        details.discountAmount || undefined,
      
      // Keep original details for compatibility
      details: details,
    };

    console.log('✅ MSW: Booking created — agentId:', agentId, '| agentCode:', agentCode, '| commission:', commissionEarned);
    console.log('🔑 MSW: New booking identifiers - id:', newBooking.id, 'bookingId:', newBooking.bookingId, 'referenceId:', newBooking.referenceId);
    
    mockBookings.push(newBooking);
    saveBookings(mockBookings); // Persist to localStorage (msw_mock_bookings)

    // ── Also mirror to localStorage.travel_bookings so agent-dashboard and
    //    admin helper functions (countAgentBookings, sumAgentCommission) can read it ──
    try {
      const lsRaw = localStorage.getItem('travel_bookings');
      const lsBookings: any[] = lsRaw ? JSON.parse(lsRaw) : [];
      lsBookings.push(newBooking);
      localStorage.setItem('travel_bookings', JSON.stringify(lsBookings));
    } catch (_) { /* ignore storage errors */ }

    console.log('📦 Total bookings:', mockBookings.length);
    console.log('📋 All booking IDs:', mockBookings.map(b => ({ id: b.id, bookingId: b.bookingId, type: b.type || b.bookingType })));
    
    return HttpResponse.json(newBooking, { status: 201 });
  }),// PUT /api/bookings/:id/cancel - Cancel booking
  http.put('/api/bookings/:id/cancel', async ({ params }) => {
    const { id } = params;
    
    if (!id) {
      console.log('❌ MSW: No booking ID provided');
      return HttpResponse.json(
        { error: 'Booking ID is required' },
        { status: 400 }
      );
    }
    
    console.log('🔵 MSW: Cancel request for booking ID:', id, 'type:', typeof id);
    console.log('📦 Current bookings:', mockBookings.length, 'bookings');
    mockBookings.forEach((b, idx) => {
      console.log(`  [${idx}] id=${b.id} (${typeof b.id}), bookingId=${b.bookingId}, referenceId=${b.referenceId}, type=${b.type || b.bookingType}`);
    });
    
    const index = mockBookings.findIndex((b) => {
      if (!b.id && !b.bookingId && !b.referenceId) {
        console.log('  ⚠️ Booking has no identifiers:', b);
        return false;
      }
      
      const idStr = id.toString();
      const bIdStr = b.id ? b.id.toString() : '';
      const bBookingIdStr = b.bookingId ? b.bookingId.toString() : '';
      const bRefIdStr = b.referenceId ? b.referenceId.toString() : '';
      
      // Try multiple matching strategies
      const match = 
        bIdStr === idStr || 
        bBookingIdStr === idStr ||
        bRefIdStr === idStr ||
        b.id === parseInt(idStr) ||
        (typeof b.id === 'number' && b.id.toString() === idStr);
      
      if (match) {
        console.log(`  ✅ MATCH FOUND: booking.id=${b.id}, booking.bookingId=${b.bookingId}, request.id=${id}`);
      }
      
      return match;
    });
    
    if (index === -1) {
      console.log('❌ MSW: Booking not found for ID:', id);
      console.log('💡 Available IDs:', mockBookings.map(b => ({ 
        id: b.id, 
        bookingId: b.bookingId,
        referenceId: b.referenceId,
        type: b.type || b.bookingType
      })));
      return HttpResponse.json(
        { 
          error: 'Booking not found', 
          requestedId: id, 
          availableBookings: mockBookings.map(b => ({
            id: b.id,
            bookingId: b.bookingId,
            referenceId: b.referenceId
          }))
        },
        { status: 404 }
      );
    }
    
    console.log('🔵 MSW: Cancelling booking:', mockBookings[index]);
    
    mockBookings[index] = {
      ...mockBookings[index],
      status: 'cancelled',
      paymentStatus: 'cancelled',
      updatedAt: new Date().toISOString(),
    };
    
    saveBookings(mockBookings); // Persist to sessionStorage
    
    console.log('✅ MSW: Booking cancelled successfully');
    
    return HttpResponse.json(mockBookings[index], { status: 200 });
  }),

  // PUT /api/bookings/:id - Update booking
  http.put('/api/bookings/:id', async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as any;
    const index = mockBookings.findIndex((b) => b.id === parseInt(id as string));
    
    if (index === -1) {
      return HttpResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }
    
    mockBookings[index] = {
      ...mockBookings[index],
      ...body,
      updatedAt: new Date().toISOString(),
    };
    
    return HttpResponse.json(mockBookings[index], { status: 200 });
  }),

  // DELETE /api/bookings/:id - Delete booking
  http.delete('/api/bookings/:id', ({ params }) => {
    const { id } = params;
    const index = mockBookings.findIndex((b) => b.id === parseInt(id as string));
    
    if (index === -1) {
      return HttpResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }
    
    mockBookings.splice(index, 1);
    
    return HttpResponse.json({ success: true }, { status: 200 });
  }),

  // GET /api/flights - Get all flights
  http.get('/api/flights', () => {
    const mockFlights = [
      // Delhi routes
      { id: 1,  airline: 'Air India',  flightNumber: 'AI-202',  origin: 'Delhi',     destination: 'Mumbai',     departureTime: '06:00', arrivalTime: '08:15', duration: '2h 15m', price: 4500,  class: 'Economy',  seatsAvailable: 45 },
      { id: 2,  airline: 'IndiGo',     flightNumber: '6E-101',  origin: 'Delhi',     destination: 'Mumbai',     departureTime: '09:30', arrivalTime: '11:45', duration: '2h 15m', price: 3800,  class: 'Economy',  seatsAvailable: 32 },
      { id: 3,  airline: 'Vistara',    flightNumber: 'UK-876',  origin: 'Delhi',     destination: 'Mumbai',     departureTime: '14:00', arrivalTime: '16:10', duration: '2h 10m', price: 5800,  class: 'Business', seatsAvailable: 12 },
      { id: 4,  airline: 'SpiceJet',   flightNumber: 'SG-301',  origin: 'Delhi',     destination: 'Bangalore',  departureTime: '07:15', arrivalTime: '09:50', duration: '2h 35m', price: 4200,  class: 'Economy',  seatsAvailable: 50 },
      { id: 5,  airline: 'IndiGo',     flightNumber: '6E-505',  origin: 'Delhi',     destination: 'Bangalore',  departureTime: '11:00', arrivalTime: '13:40', duration: '2h 40m', price: 3900,  class: 'Economy',  seatsAvailable: 28 },
      { id: 6,  airline: 'Air India',  flightNumber: 'AI-504',  origin: 'Delhi',     destination: 'Chennai',    departureTime: '06:45', arrivalTime: '09:30', duration: '2h 45m', price: 5100,  class: 'Economy',  seatsAvailable: 38 },
      { id: 7,  airline: 'Vistara',    flightNumber: 'UK-312',  origin: 'Delhi',     destination: 'Hyderabad',  departureTime: '08:30', arrivalTime: '11:00', duration: '2h 30m', price: 4700,  class: 'Economy',  seatsAvailable: 22 },
      { id: 8,  airline: 'IndiGo',     flightNumber: '6E-701',  origin: 'Delhi',     destination: 'Kolkata',    departureTime: '10:00', arrivalTime: '12:15', duration: '2h 15m', price: 4100,  class: 'Economy',  seatsAvailable: 41 },
      { id: 9,  airline: 'SpiceJet',   flightNumber: 'SG-412',  origin: 'Delhi',     destination: 'Goa',        departureTime: '13:20', arrivalTime: '15:50', duration: '2h 30m', price: 5500,  class: 'Economy',  seatsAvailable: 18 },
      { id: 10, airline: 'Air India',  flightNumber: 'AI-670',  origin: 'Delhi',     destination: 'Kochi',      departureTime: '07:00', arrivalTime: '10:15', duration: '3h 15m', price: 6200,  class: 'Economy',  seatsAvailable: 29 },
      // Mumbai routes
      { id: 11, airline: 'IndiGo',     flightNumber: '6E-345',  origin: 'Mumbai',    destination: 'Bangalore',  departureTime: '14:30', arrivalTime: '16:00', duration: '1h 30m', price: 3200,  class: 'Economy',  seatsAvailable: 28 },
      { id: 12, airline: 'Air India',  flightNumber: 'AI-605',  origin: 'Mumbai',    destination: 'Delhi',      departureTime: '08:00', arrivalTime: '10:10', duration: '2h 10m', price: 4600,  class: 'Economy',  seatsAvailable: 35 },
      { id: 13, airline: 'Vistara',    flightNumber: 'UK-440',  origin: 'Mumbai',    destination: 'Delhi',      departureTime: '16:45', arrivalTime: '18:55', duration: '2h 10m', price: 5900,  class: 'Business', seatsAvailable: 8  },
      { id: 14, airline: 'SpiceJet',   flightNumber: 'SG-220',  origin: 'Mumbai',    destination: 'Chennai',    departureTime: '07:30', arrivalTime: '09:30', duration: '2h 00m', price: 3700,  class: 'Economy',  seatsAvailable: 47 },
      { id: 15, airline: 'IndiGo',     flightNumber: '6E-210',  origin: 'Mumbai',    destination: 'Hyderabad',  departureTime: '11:15', arrivalTime: '13:00', duration: '1h 45m', price: 3400,  class: 'Economy',  seatsAvailable: 33 },
      { id: 16, airline: 'Air India',  flightNumber: 'AI-780',  origin: 'Mumbai',    destination: 'Kolkata',    departureTime: '09:00', arrivalTime: '11:30', duration: '2h 30m', price: 4900,  class: 'Economy',  seatsAvailable: 21 },
      { id: 17, airline: 'GoAir',      flightNumber: 'G8-115',  origin: 'Mumbai',    destination: 'Goa',        departureTime: '06:30', arrivalTime: '07:40', duration: '1h 10m', price: 2800,  class: 'Economy',  seatsAvailable: 55 },
      { id: 18, airline: 'IndiGo',     flightNumber: '6E-320',  origin: 'Mumbai',    destination: 'Kochi',      departureTime: '15:00', arrivalTime: '16:40', duration: '1h 40m', price: 3600,  class: 'Economy',  seatsAvailable: 40 },
      // Bangalore routes
      { id: 19, airline: 'Vistara',    flightNumber: 'UK-566',  origin: 'Bangalore', destination: 'Delhi',      departureTime: '06:00', arrivalTime: '08:45', duration: '2h 45m', price: 5200,  class: 'Economy',  seatsAvailable: 30 },
      { id: 20, airline: 'IndiGo',     flightNumber: '6E-420',  origin: 'Bangalore', destination: 'Mumbai',     departureTime: '10:00', arrivalTime: '11:30', duration: '1h 30m', price: 3100,  class: 'Economy',  seatsAvailable: 44 },
      { id: 21, airline: 'Air India',  flightNumber: 'AI-812',  origin: 'Bangalore', destination: 'Chennai',    departureTime: '08:45', arrivalTime: '09:45', duration: '1h 00m', price: 2500,  class: 'Economy',  seatsAvailable: 52 },
      { id: 22, airline: 'SpiceJet',   flightNumber: 'SG-530',  origin: 'Bangalore', destination: 'Hyderabad',  departureTime: '13:30', arrivalTime: '14:45', duration: '1h 15m', price: 2900,  class: 'Economy',  seatsAvailable: 36 },
      { id: 23, airline: 'IndiGo',     flightNumber: '6E-610',  origin: 'Bangalore', destination: 'Kolkata',    departureTime: '07:00', arrivalTime: '09:30', duration: '2h 30m', price: 4400,  class: 'Economy',  seatsAvailable: 25 },
      { id: 24, airline: 'GoAir',      flightNumber: 'G8-214',  origin: 'Bangalore', destination: 'Goa',        departureTime: '16:00', arrivalTime: '17:10', duration: '1h 10m', price: 2700,  class: 'Economy',  seatsAvailable: 48 },
      { id: 25, airline: 'Vistara',    flightNumber: 'UK-680',  origin: 'Bangalore', destination: 'Kochi',      departureTime: '09:30', arrivalTime: '10:30', duration: '1h 00m', price: 2600,  class: 'Economy',  seatsAvailable: 60 },
      // Hyderabad routes
      { id: 26, airline: 'IndiGo',     flightNumber: '6E-720',  origin: 'Hyderabad', destination: 'Delhi',      departureTime: '05:55', arrivalTime: '08:20', duration: '2h 25m', price: 4800,  class: 'Economy',  seatsAvailable: 27 },
      { id: 27, airline: 'Air India',  flightNumber: 'AI-915',  origin: 'Hyderabad', destination: 'Mumbai',     departureTime: '11:30', arrivalTime: '13:15', duration: '1h 45m', price: 3500,  class: 'Economy',  seatsAvailable: 39 },
      { id: 28, airline: 'SpiceJet',   flightNumber: 'SG-614',  origin: 'Hyderabad', destination: 'Bangalore',  departureTime: '15:45', arrivalTime: '17:00', duration: '1h 15m', price: 2800,  class: 'Economy',  seatsAvailable: 43 },
      { id: 29, airline: 'Vistara',    flightNumber: 'UK-722',  origin: 'Hyderabad', destination: 'Chennai',    departureTime: '08:00', arrivalTime: '09:10', duration: '1h 10m', price: 2600,  class: 'Economy',  seatsAvailable: 34 },
      { id: 30, airline: 'IndiGo',     flightNumber: '6E-830',  origin: 'Hyderabad', destination: 'Goa',        departureTime: '12:00', arrivalTime: '13:15', duration: '1h 15m', price: 3100,  class: 'Economy',  seatsAvailable: 20 },
      // Chennai routes
      { id: 31, airline: 'Air India',  flightNumber: 'AI-310',  origin: 'Chennai',   destination: 'Delhi',      departureTime: '06:30', arrivalTime: '09:20', duration: '2h 50m', price: 5300,  class: 'Economy',  seatsAvailable: 31 },
      { id: 32, airline: 'IndiGo',     flightNumber: '6E-910',  origin: 'Chennai',   destination: 'Mumbai',     departureTime: '10:45', arrivalTime: '12:45', duration: '2h 00m', price: 3900,  class: 'Economy',  seatsAvailable: 46 },
      { id: 33, airline: 'SpiceJet',   flightNumber: 'SG-702',  origin: 'Chennai',   destination: 'Bangalore',  departureTime: '07:15', arrivalTime: '08:15', duration: '1h 00m', price: 2400,  class: 'Economy',  seatsAvailable: 58 },
      { id: 34, airline: 'Vistara',    flightNumber: 'UK-850',  origin: 'Chennai',   destination: 'Kolkata',    departureTime: '14:00', arrivalTime: '16:10', duration: '2h 10m', price: 4600,  class: 'Economy',  seatsAvailable: 23 },
      { id: 35, airline: 'Air India',  flightNumber: 'AI-430',  origin: 'Chennai',   destination: 'Kochi',      departureTime: '16:30', arrivalTime: '17:30', duration: '1h 00m', price: 2300,  class: 'Economy',  seatsAvailable: 62 },
      // Kolkata routes
      { id: 36, airline: 'IndiGo',     flightNumber: '6E-112',  origin: 'Kolkata',   destination: 'Delhi',      departureTime: '05:30', arrivalTime: '07:45', duration: '2h 15m', price: 4300,  class: 'Economy',  seatsAvailable: 36 },
      { id: 37, airline: 'Air India',  flightNumber: 'AI-545',  origin: 'Kolkata',   destination: 'Mumbai',     departureTime: '09:15', arrivalTime: '11:45', duration: '2h 30m', price: 5000,  class: 'Economy',  seatsAvailable: 28 },
      { id: 38, airline: 'SpiceJet',   flightNumber: 'SG-812',  origin: 'Kolkata',   destination: 'Bangalore',  departureTime: '12:30', arrivalTime: '15:00', duration: '2h 30m', price: 4500,  class: 'Economy',  seatsAvailable: 19 },
      { id: 39, airline: 'Vistara',    flightNumber: 'UK-960',  origin: 'Kolkata',   destination: 'Chennai',    departureTime: '08:00', arrivalTime: '10:10', duration: '2h 10m', price: 4700,  class: 'Economy',  seatsAvailable: 24 },
      // Goa routes
      { id: 40, airline: 'IndiGo',     flightNumber: '6E-512',  origin: 'Goa',       destination: 'Delhi',      departureTime: '10:30', arrivalTime: '13:00', duration: '2h 30m', price: 5400,  class: 'Economy',  seatsAvailable: 16 },
      { id: 41, airline: 'GoAir',      flightNumber: 'G8-320',  origin: 'Goa',       destination: 'Mumbai',     departureTime: '08:00', arrivalTime: '09:10', duration: '1h 10m', price: 2900,  class: 'Economy',  seatsAvailable: 50 },
      { id: 42, airline: 'SpiceJet',   flightNumber: 'SG-923',  origin: 'Goa',       destination: 'Bangalore',  departureTime: '15:00', arrivalTime: '16:10', duration: '1h 10m', price: 2700,  class: 'Economy',  seatsAvailable: 37 },
      // Kochi routes
      { id: 43, airline: 'Air India',  flightNumber: 'AI-760',  origin: 'Kochi',     destination: 'Delhi',      departureTime: '06:45', arrivalTime: '10:00', duration: '3h 15m', price: 6100,  class: 'Economy',  seatsAvailable: 22 },
      { id: 44, airline: 'IndiGo',     flightNumber: '6E-615',  origin: 'Kochi',     destination: 'Mumbai',     departureTime: '14:00', arrivalTime: '15:40', duration: '1h 40m', price: 3700,  class: 'Economy',  seatsAvailable: 41 },
      { id: 45, airline: 'Vistara',    flightNumber: 'UK-488',  origin: 'Kochi',     destination: 'Bangalore',  departureTime: '09:00', arrivalTime: '10:00', duration: '1h 00m', price: 2700,  class: 'Economy',  seatsAvailable: 55 },
      // Jaipur routes
      { id: 46, airline: 'IndiGo',     flightNumber: '6E-219',  origin: 'Jaipur',    destination: 'Mumbai',     departureTime: '07:00', arrivalTime: '09:00', duration: '2h 00m', price: 3800,  class: 'Economy',  seatsAvailable: 30 },
      { id: 47, airline: 'Air India',  flightNumber: 'AI-318',  origin: 'Jaipur',    destination: 'Bangalore',  departureTime: '11:30', arrivalTime: '14:10', duration: '2h 40m', price: 4600,  class: 'Economy',  seatsAvailable: 25 },
      // Pune routes
      { id: 48, airline: 'SpiceJet',   flightNumber: 'SG-614',  origin: 'Pune',      destination: 'Delhi',      departureTime: '08:30', arrivalTime: '10:45', duration: '2h 15m', price: 4400,  class: 'Economy',  seatsAvailable: 33 },
      { id: 49, airline: 'IndiGo',     flightNumber: '6E-727',  origin: 'Pune',      destination: 'Bangalore',  departureTime: '13:00', arrivalTime: '14:30', duration: '1h 30m', price: 3200,  class: 'Economy',  seatsAvailable: 42 },
      // Ahmedabad routes
      { id: 50, airline: 'Air India',  flightNumber: 'AI-412',  origin: 'Ahmedabad', destination: 'Delhi',      departureTime: '06:15', arrivalTime: '07:55', duration: '1h 40m', price: 3600,  class: 'Economy',  seatsAvailable: 38 },
      { id: 51, airline: 'IndiGo',     flightNumber: '6E-824',  origin: 'Ahmedabad', destination: 'Mumbai',     departureTime: '09:45', arrivalTime: '11:10', duration: '1h 25m', price: 2900,  class: 'Economy',  seatsAvailable: 51 },
      { id: 52, airline: 'IndiGo',     flightNumber: '6E-316',  origin: 'Ahmedabad', destination: 'Bangalore',  departureTime: '15:30', arrivalTime: '17:30', duration: '2h 00m', price: 4100,  class: 'Economy',  seatsAvailable: 27 },
    ];
    
    return HttpResponse.json(mockFlights, { status: 200 });
  }),

  // GET /api/buses - Get all buses
  http.get('/api/buses', () => {
    const mockBuses = [
      {
        id: 1,
        operator: 'VRL Travels',
        busType: 'AC Sleeper',
        origin: 'Delhi',
        destination: 'Jaipur',
        departureTime: '22:00',
        arrivalTime: '06:00',
        duration: '8h',
        price: 800,
        seatsAvailable: 12,
        amenities: ['WiFi', 'Blanket', 'Water Bottle', 'Charging Point'],
      },
    ];
    
    return HttpResponse.json(mockBuses, { status: 200 });
  }),

  // GET /api/hotels - Get all hotels
  http.get('/api/hotels', () => {
    const mockHotels = [
      {
        id: 1,
        name: 'Taj Palace',
        location: 'Mumbai',
        stars: 5,
        rating: 4.8,
        reviewCount: 1250,
        pricePerNight: 8500,
        imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945',
        amenities: ['Pool', 'Spa', 'Gym', 'Restaurant', 'WiFi', 'Parking'],
        roomTypes: ['Deluxe Room', 'Premium Suite', 'Presidential Suite'],
      },
    ];
    
    return HttpResponse.json(mockHotels, { status: 200 });
  }),
  // GET /api/packages - Get all packages
  http.get('/api/packages', () => {
    const mockPackages = [
      {
        id: 1,
        name: 'Goa Beach Paradise',
        destination: 'Goa',
        duration: '4 Days / 3 Nights',
        price: 12999,
        rating: 4.7,
        reviewCount: 856,
        imageUrl: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19',
        includes: ['Hotel', 'Breakfast', 'Airport Transfer', 'Sightseeing'],
      },
    ];
    
    return HttpResponse.json(mockPackages, { status: 200 });
  }),

  // Passthrough payment, ticket & WhatsApp endpoints — handled by the real API server
  http.post('/api/payments/create-order',  () => passthrough()),
  http.post('/api/payments/verify',        () => passthrough()),
  http.post('/api/tickets/generate',       () => passthrough()),
  http.post('/api/tickets/send-email',     () => passthrough()),
  http.post('/api/send-whatsapp',          () => passthrough()),

  // Marketing automation — all pass through to real backend
  http.post('/api/marketing/search-event',    () => passthrough()),
  http.post('/api/marketing/booking-followup',() => passthrough()),
  http.post('/api/marketing/cancel-search',   () => passthrough()),
  http.post('/api/marketing/activity',        () => passthrough()),
  http.post('/api/marketing/send-daily-offers',() => passthrough()),
  http.get('/api/marketing/status',           () => passthrough()),

  // TripJack proxy routes — all must pass through to the API server
  http.post('/api/search',       () => passthrough()),
  http.post('/api/fareQuote',    () => passthrough()),
  http.post('/api/ssr',          () => passthrough()),
  http.post('/api/book',         () => passthrough()),
  http.post('/api/book-flight',  () => passthrough()),
  http.post('/api/tj-search',    () => passthrough()),
  http.post('/api/tj-farequote', () => passthrough()),
  http.post('/api/tj-ssr',       () => passthrough()),
  http.post('/api/tj-book',      () => passthrough()),
  http.post('/api/admin/test-razorpay',    () => passthrough()),

  // Live search endpoints — all pass through to real backend
  http.get('/api/flights/live-search', () => passthrough()),
  http.get('/api/hotels/live-search',  () => passthrough()),
  http.get('/api/buses/live-search',   () => passthrough()),
  http.get('/api/airports/search',     () => passthrough()),
  http.get('/api/currency/rates',      () => passthrough()),
  http.get('/api/currency/convert',    () => passthrough()),

  // DEAD CODE BELOW — kept for reference, never reached
  http.get('/api/flights/live-search-DISABLED', ({ request }) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from') || '';
    const to   = url.searchParams.get('to')   || '';

    // City name → IATA lookup (mirrors server-side map)
    const CITY_TO_IATA: Record<string, string> = {
      delhi: 'DEL', 'new delhi': 'DEL',
      mumbai: 'BOM', bombay: 'BOM',
      bangalore: 'BLR', bengaluru: 'BLR',
      chennai: 'MAA', madras: 'MAA',
      kolkata: 'CCU', calcutta: 'CCU',
      hyderabad: 'HYD',
      goa: 'GOI',
      kochi: 'COK', cochin: 'COK',
      jaipur: 'JAI',
      pune: 'PNQ',
      ahmedabad: 'AMD',
      lucknow: 'LKO',
      varanasi: 'VNS',
      amritsar: 'ATQ',
      nagpur: 'NAG',
      indore: 'IDR',
      bhopal: 'BHO',
      srinagar: 'SXR',
      leh: 'IXL',
      patna: 'PAT',
      ranchi: 'IXR',
      bhubaneswar: 'BBI',
      visakhapatnam: 'VTZ', vizag: 'VTZ',
      vijayawada: 'VGA',
      coimbatore: 'CJB',
      trichy: 'TRZ', tiruchirappalli: 'TRZ',
      madurai: 'IXM',
      mangalore: 'IXE',
      tirupati: 'TIR',
      vadodara: 'BDQ',
      surat: 'STV',
      chandigarh: 'IXC',
      jodhpur: 'JDH',
      rajkot: 'RAJ',
      raipur: 'RPR',
      dehradun: 'DED',
      udaipur: 'UDR',
      jammu: 'IXJ',
      bagdogra: 'IXB',
      'port blair': 'IXZ',
      aurangabad: 'IXU',
      thiruvananthapuram: 'TRV', trivandrum: 'TRV',
      shimla: 'SLV',
      guwahati: 'GAU',
      // International
      dubai: 'DXB',
      'abu dhabi': 'AUH',
      sharjah: 'SHJ',
      doha: 'DOH',
      riyadh: 'RUH',
      muscat: 'MCT',
      bahrain: 'BAH',
      kuwait: 'KWI',
      singapore: 'SIN',
      bangkok: 'BKK',
      'kuala lumpur': 'KUL',
      jakarta: 'CGK',
      manila: 'MNL',
      phuket: 'HKT',
      bali: 'DPS',
      'hong kong': 'HKG',
      tokyo: 'NRT',
      beijing: 'PEK',
      seoul: 'ICN',
      colombo: 'CMB',
      kathmandu: 'KTM',
      dhaka: 'DAC',
      male: 'MLE',
      london: 'LHR',
      frankfurt: 'FRA',
      paris: 'CDG',
      amsterdam: 'AMS',
      'new york': 'JFK',
      'san francisco': 'SFO',
      toronto: 'YYZ',
      sydney: 'SYD',
      melbourne: 'MEL',
    };

    const CANONICAL: Record<string, string> = {
      DEL: 'Delhi', BOM: 'Mumbai', BLR: 'Bangalore', MAA: 'Chennai',
      CCU: 'Kolkata', HYD: 'Hyderabad', GOI: 'Goa', COK: 'Kochi',
      JAI: 'Jaipur', PNQ: 'Pune', AMD: 'Ahmedabad', LKO: 'Lucknow',
      VNS: 'Varanasi', ATQ: 'Amritsar', NAG: 'Nagpur', IDR: 'Indore',
      BHO: 'Bhopal', SXR: 'Srinagar', IXL: 'Leh', PAT: 'Patna',
      IXR: 'Ranchi', BBI: 'Bhubaneswar', VTZ: 'Visakhapatnam',
      CJB: 'Coimbatore', TRZ: 'Trichy', IXM: 'Madurai',
      IXE: 'Mangalore', BDQ: 'Vadodara', STV: 'Surat', IXC: 'Chandigarh',
      VGA: 'Vijayawada', RAJ: 'Rajkot', JDH: 'Jodhpur', RPR: 'Raipur',
      DED: 'Dehradun', UDR: 'Udaipur', IXJ: 'Jammu', IXB: 'Bagdogra',
      IXZ: 'Port Blair', TIR: 'Tirupati', IXU: 'Aurangabad', TRV: 'Thiruvananthapuram',
      SLV: 'Shimla', GAU: 'Guwahati',
      DXB: 'Dubai', AUH: 'Abu Dhabi', SHJ: 'Sharjah', DOH: 'Doha',
      RUH: 'Riyadh', MCT: 'Muscat', BAH: 'Bahrain', KWI: 'Kuwait',
      SIN: 'Singapore', BKK: 'Bangkok', KUL: 'Kuala Lumpur', CGK: 'Jakarta',
      MNL: 'Manila', HKT: 'Phuket', DPS: 'Bali', HKG: 'Hong Kong',
      NRT: 'Tokyo', PEK: 'Beijing', ICN: 'Seoul',
      CMB: 'Colombo', KTM: 'Kathmandu', DAC: 'Dhaka', MLE: 'Male',
      LHR: 'London', FRA: 'Frankfurt', CDG: 'Paris', AMS: 'Amsterdam',
      JFK: 'New York', SFO: 'San Francisco', YYZ: 'Toronto',
      SYD: 'Sydney', MEL: 'Melbourne',
    };

    const fromIata = CITY_TO_IATA[from.toLowerCase().trim()];
    const toIata   = CITY_TO_IATA[to.toLowerCase().trim()];

    if (!fromIata || !toIata) {
      return HttpResponse.json(
        { error: `Could not find airport for "${!fromIata ? from : to}". Please use a major city name.` },
        { status: 400 }
      );
    }

    const originName = CANONICAL[fromIata] || from;
    const destName   = CANONICAL[toIata]   || to;

    // Deterministic seed — same route always gives same schedule
    const seed = fromIata.charCodeAt(0) * 31 + toIata.charCodeAt(0) * 17;
    const baseHours = 1 + (seed % 5);          // 1–5 h flight
    const baseMins  = (seed * 7) % 55;
    const totalDurMins = baseHours * 60 + baseMins;

    // Realistic base price from route distance heuristic
    const basePrice = 2500 + ((fromIata.charCodeAt(0) + toIata.charCodeAt(0)) * 37) % 7000;

    const AIRLINES = [
      { name: 'IndiGo',    prefix: '6E', nums: ['301', '505', '610', '701', '820', '934'] },
      { name: 'Air India', prefix: 'AI', nums: ['202', '504', '670', '780', '915', '118'] },
      { name: 'Vistara',   prefix: 'UK', nums: ['312', '440', '566', '680', '722', '888'] },
      { name: 'SpiceJet',  prefix: 'SG', nums: ['220', '301', '412', '530', '614', '723'] },
      { name: 'Akasa Air', prefix: 'QP', nums: ['1101', '1203', '1304', '1405', '1506', '1607'] },
      { name: 'GoAir',     prefix: 'G8', nums: ['115', '214', '320', '412', '518', '624'] },
    ];

    const DEP_SLOTS = ['05:45', '08:00', '11:30', '14:00', '17:30', '20:15'];
    const CLASSES = ['Economy', 'Economy', 'Business', 'Economy', 'Economy', 'Economy'];

    const flights = AIRLINES.map((airline, idx) => {
      const [dh, dm] = DEP_SLOTS[idx].split(':').map(Number);
      const arrTotal = dh * 60 + dm + totalDurMins;
      const ah = Math.floor((arrTotal % 1440) / 60);
      const am = arrTotal % 60;
      const arrTime = `${ah.toString().padStart(2, '0')}:${am.toString().padStart(2, '0')}`;
      const durStr  = `${baseHours}h ${baseMins.toString().padStart(2, '0')}m`;
      const price   = Math.round((basePrice + idx * 350) / 100) * 100;
      const flightClass = CLASSES[idx];

      return {
        id: idx + 1,
        airline: airline.name,
        flightNumber: `${airline.prefix}-${airline.nums[idx % airline.nums.length]}`,
        origin: originName,
        destination: destName,
        departureTime: DEP_SLOTS[idx],
        arrivalTime: arrTime,
        duration: durStr,
        price,
        class: flightClass,
        seatsAvailable: 8 + (idx * 9) % 50,
        stops: 0,
        status: 'scheduled',
      };
    });

    return HttpResponse.json({
      flights,
      total: flights.length,
      source: 'scheduled',
      fallbackMessage: `Showing scheduled flights for ${originName} → ${destName}`,
    });
  }),

  // GET /api/flights/:id - Get specific flight
  http.get('/api/flights/:id', ({ params }) => {
    const { id } = params;
    const flightId = parseInt(id as string);
    
    const mockFlight = {
      id: flightId,
      airline: 'Air India',
      flightNumber: 'AI-202',
      origin: 'Delhi',
      destination: 'Mumbai',
      departureTime: '06:00',
      arrivalTime: '08:15',
      duration: '2h 15m',
      price: 4500,
      class: 'Economy',
      seatsAvailable: 45,
    };
    
    return HttpResponse.json(mockFlight, { status: 200 });
  }),

  // GET /api/buses/:id - Get specific bus
  http.get('/api/buses/:id', ({ params }) => {
    const { id } = params;
    const busId = parseInt(id as string);
    
    const mockBus = {
      id: busId,
      operator: 'VRL Travels',
      busType: 'AC Sleeper',
      origin: 'Delhi',
      destination: 'Jaipur',
      departureTime: '22:00',
      arrivalTime: '06:00',
      duration: '8h',
      price: 800,
      seatsAvailable: 12,
      amenities: ['WiFi', 'Blanket', 'Water Bottle', 'Charging Point'],
    };
    
    return HttpResponse.json(mockBus, { status: 200 });
  }),

  // GET /api/hotels/:id - Get specific hotel
  http.get('/api/hotels/:id', ({ params }) => {
    const { id } = params;
    const hotelId = parseInt(id as string);

    const HOTELS_BY_ID: Record<number, object> = {
      1: { id: 1, name: "Grand Palace Hotel",     city: "Hyderabad", location: "Banjara Hills",     stars: 5, rating: 4.5, ratingCount: 1240, pricePerNight: 2500, amenities: ["AC","WiFi","Parking","TV","Restaurant","Room Service","Gym"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80" },
      2: { id: 2, name: "Sea View Resort",         city: "Goa",       location: "Calangute Beach",   stars: 4, rating: 4.2, ratingCount: 892,  pricePerNight: 3000, amenities: ["AC","WiFi","Pool","Restaurant","Bar","Beach Access"],           imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80" },
      3: { id: 3, name: "The Taj Majestic",        city: "Mumbai",    location: "Nariman Point",     stars: 5, rating: 4.7, ratingCount: 2100, pricePerNight: 8000, amenities: ["AC","WiFi","Pool","Spa","Restaurant","Bar","Gym","Parking"],    imageUrl: "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?w=800&q=80" },
      4: { id: 4, name: "Comfort Inn Express",     city: "Delhi",     location: "Connaught Place",   stars: 3, rating: 3.8, ratingCount: 540,  pricePerNight: 1500, amenities: ["AC","WiFi","TV","Parking"],                                    imageUrl: "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80" },
      5: { id: 5, name: "Royal Orchid Retreat",    city: "Bangalore", location: "MG Road",           stars: 4, rating: 4.1, ratingCount: 780,  pricePerNight: 3500, amenities: ["AC","WiFi","Pool","Gym","Restaurant","Parking"],               imageUrl: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80" },
      6: { id: 6, name: "The Lake View Palace",    city: "Udaipur",   location: "Lake Pichola",      stars: 5, rating: 4.8, ratingCount: 1560, pricePerNight: 12000,amenities: ["AC","WiFi","Pool","Spa","Restaurant","Yoga","Heritage Architecture"], imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80" },
      7: { id: 7, name: "Backwaters Paradise",     city: "Kochi",     location: "Alleppey",          stars: 4, rating: 4.3, ratingCount: 430,  pricePerNight: 4500, amenities: ["AC","WiFi","Pool","Restaurant","Room Service"],                 imageUrl: "https://images.unsplash.com/photo-1578991624414-276ef23a534f?w=800&q=80" },
      8: { id: 8, name: "Pink City Grand",         city: "Jaipur",    location: "MI Road",           stars: 4, rating: 4.0, ratingCount: 620,  pricePerNight: 2800, amenities: ["AC","WiFi","Pool","Restaurant","Parking","Heritage Architecture"], imageUrl: "https://images.unsplash.com/photo-1590073242678-70ee3fc28e8e?w=800&q=80" },
    };

    const found = HOTELS_BY_ID[hotelId];
    if (!found) {
      return HttpResponse.json({ error: "Hotel not found" }, { status: 404 });
    }
    return HttpResponse.json(found, { status: 200 });
  }),

  // GET /api/packages/:id - Get specific package
  http.get('/api/packages/:id', ({ params }) => {
    const { id } = params;
    const packageId = parseInt(id as string);
    
    const mockPackage = {
      id: packageId,
      name: 'Goa Beach Paradise',
      destination: 'Goa',
      duration: '4 Days / 3 Nights',
      price: 12999,
      rating: 4.7,
      reviewCount: 856,
      imageUrl: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19',
      includes: ['Hotel', 'Breakfast', 'Airport Transfer', 'Sightseeing'],
    };
    
    return HttpResponse.json(mockPackage, { status: 200 });
  }),

  // GET /api/flights/search - Search flights
  http.get('/api/flights/search', () => {
    return HttpResponse.json([
      {
        id: 1,
        airline: 'Air India',
        flightNumber: 'AI-202',
        origin: 'Delhi',
        destination: 'Mumbai',
        departureTime: '06:00',
        arrivalTime: '08:15',
        duration: '2h 15m',
        price: 4500,
        class: 'Economy',
        seatsAvailable: 45,
      },
    ], { status: 200 });
  }),

  // GET /api/buses/search - Search buses
  http.get('/api/buses/search', () => {
    return HttpResponse.json([
      {
        id: 1,
        operator: 'VRL Travels',
        busType: 'AC Sleeper',
        origin: 'Delhi',
        destination: 'Jaipur',
        departureTime: '22:00',
        arrivalTime: '06:00',
        duration: '8h',
        price: 800,
        seatsAvailable: 12,
        amenities: ['WiFi', 'Blanket', 'Water Bottle', 'Charging Point'],
      },
    ], { status: 200 });
  }),

  // GET /api/hotels/search - Search hotels
  http.get('/api/hotels/search', () => {
    return HttpResponse.json([
      {
        id: 1,
        name: 'Taj Palace',
        location: 'Mumbai',
        stars: 5,
        rating: 4.8,
        reviewCount: 1250,
        pricePerNight: 8500,
        imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945',
        amenities: ['Pool', 'Spa', 'Gym', 'Restaurant', 'WiFi', 'Parking'],
        roomTypes: ['Deluxe Room', 'Premium Suite', 'Presidential Suite'],
      },
    ], { status: 200 });
  }),
];

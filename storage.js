const TurfDB = (function () {
  'use strict';


  // localStorage 
  const KEYS = {
    USERS: 'turf_users',
    BOOKINGS: 'turf_bookings',
    CUSTOMER_SESSION: 'turf_customer_session',
    ADMIN_SESSION: 'turf_admin_session'
  };

  // Allowed booking
  const STATUS = Object.freeze({
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed'
  });

  // Turf details shown on the home page 
  const TURF_INFO = Object.freeze({
    name: 'Smash Badminton Turf',
    tagline: 'Indoor courts you can book by the hour.',
    courts: ['Court 1', 'Court 2', 'Court 3', 'Court 4'],
    openDays: 'Every day',
    openHour: 6,            
    closeHour: 23,          
    pricePerHour: 800,      
    currency: '৳',
    advanceBookingDays: 30, 
    address: '408/1 (Old KA 66/1), Kuratoli, Khilkhet',
    phone: '+00 1534283987',
    email: 'smashturf@gmail.com',
    rules: [
      'Non-marking shoes are required on court.',
      'Arrive 10 minutes before your slot starts.',
      'Each slot is one hour. Time cannot be carried over.',
      'Only water is allowed on the courts.',
      'Cancel through your bookings page if you cannot make it.'
    ]
  });

  // admin login
  const DEMO_ADMIN = Object.freeze({ username: 'admin', password: 'admin123' });


  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.error('Could not read "' + key + '" from localStorage:', err);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function removeKey(key) {
    localStorage.removeItem(key);
  }

 
  function generateId(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  // User object without the password 
  function publicUser(user) {
    return { id: user.id, name: user.name, email: user.email, phone: user.phone };
  }

  

  function getTurfInfo() {
    return TURF_INFO;
  }

  // Time slot
  function getTimeSlots() {
    const slots = [];
    for (let hour = TURF_INFO.openHour; hour < TURF_INFO.closeHour; hour++) {
      slots.push(String(hour).padStart(2, '0') + ':00');
    }
    return slots;
  }

 // check if this email already exits in list
  function registerCustomer(details) {
    const users = readJSON(KEYS.USERS, []);
    const email = normalizeEmail(details.email);

    if (users.some(function (u) { return u.email === email; })) {
      return { ok: false, error: 'An account with this email already exists.' };
    }

    const user = {
      id: generateId('usr'),
      name: String(details.name || '').trim(),
      email: email,
      phone: String(details.phone || '').trim(),
      password: details.password,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    writeJSON(KEYS.USERS, users);
    return { ok: true, user: publicUser(user) };
  }

  // Check credentials and start a session.
  function loginCustomer(email, password) {
    const users = readJSON(KEYS.USERS, []);
    const cleanEmail = normalizeEmail(email);
    const user = users.find(function (u) {
      return u.email === cleanEmail && u.password === password;
    });

    if (!user) {
      return { ok: false, error: 'Incorrect email or password.' };
    }
    const session = Object.assign({}, publicUser(user), { loggedInAt: new Date().toISOString() });
    writeJSON(KEYS.CUSTOMER_SESSION, session);
    return { ok: true, user: publicUser(user) };
  }

 
  function getCurrentCustomer() {
    return readJSON(KEYS.CUSTOMER_SESSION, null);
  }

  // Later: POST /api/customers/logout
  function logoutCustomer() {
    removeKey(KEYS.CUSTOMER_SESSION);
  }

  
//ADMIN PART

  // admin login 

  function loginAdmin(username, password) {
    if (String(username).trim() === DEMO_ADMIN.username && password === DEMO_ADMIN.password) {
      writeJSON(KEYS.ADMIN_SESSION, { username: DEMO_ADMIN.username, loggedInAt: new Date().toISOString() });
      return { ok: true };
    }
    return { ok: false, error: 'Incorrect admin username or password.' };
  }

 
  function getCurrentAdmin() {
    return readJSON(KEYS.ADMIN_SESSION, null);
  }

 
  function logoutAdmin() {
    removeKey(KEYS.ADMIN_SESSION);
  }

  
  function getDemoAdminCredentials() {
   return { username: DEMO_ADMIN.username, password: DEMO_ADMIN.password };
  }

 
    //BOOKINGS
 
  function getAllBookings() {
    return readJSON(KEYS.BOOKINGS, []);
  }

  // Bookings by customer 
  function getBookingsByCustomer(email) {
    const cleanEmail = normalizeEmail(email);
    return getAllBookings().filter(function (b) { return b.customerEmail === cleanEmail; });
  }


  function getTakenSlots(date, court) {
    return getAllBookings()
      .filter(function (b) {
        return b.date === date && b.court === court && b.status !== STATUS.CANCELLED;
      })
      .map(function (b) { return b.timeSlot; });
  }

  function createBookings(request) {
    const customer = request.customer;
    const date = request.date;
    const court = request.court;
    const timeSlots = request.timeSlots || [];

    if (!customer || !date || !court || timeSlots.length === 0) {
      return { ok: false, error: 'Choose a date, a court and at least one time slot.' };
    }

    const validSlots = getTimeSlots();
    if (!TURF_INFO.courts.includes(court) || timeSlots.some(function (s) { return !validSlots.includes(s); })) {
      return { ok: false, error: 'The selected court or time slot is not valid.' };
    }

    const taken = getTakenSlots(date, court);
    const conflicts = timeSlots.filter(function (s) { return taken.includes(s); });
    if (conflicts.length > 0) {
      return {
        ok: false,
        conflicts: conflicts,
        error: 'Some of the selected slots were just booked by someone else. Choose different slots.'
      };
    }

    const now = new Date().toISOString();
    const created = timeSlots.map(function (slot) {
      return {
        id: generateId('bk'),
        customerName: customer.name,
        customerEmail: normalizeEmail(customer.email),
        date: date,
        court: court,
        timeSlot: slot,
        price: TURF_INFO.pricePerHour,
        status: STATUS.CONFIRMED,
        createdAt: now,
        updatedAt: now
      };
    });

    writeJSON(KEYS.BOOKINGS, getAllBookings().concat(created));
    return { ok: true, bookings: created };
  }

  // booking slot change
  function changeStatus(id, newStatus, ownerEmail) {
    const bookings = getAllBookings();
    const booking = bookings.find(function (b) { return b.id === id; });

    if (!booking) {
      return { ok: false, error: 'Booking not found.' };
    }
    if (ownerEmail && booking.customerEmail !== normalizeEmail(ownerEmail)) {
      return { ok: false, error: 'You can only change your own bookings.' };
    }
    if (booking.status !== STATUS.CONFIRMED) {
      return { ok: false, error: 'Only confirmed bookings can be changed.' };
    }

    booking.status = newStatus;
    booking.updatedAt = new Date().toISOString();
    writeJSON(KEYS.BOOKINGS, bookings);
    return { ok: true, booking: booking };
  }

  // Customer cancel
  function cancelBookingForCustomer(id, customerEmail) {
    return changeStatus(id, STATUS.CANCELLED, customerEmail);
  }

  // ADMIN cancel 
  function updateBookingStatus(id, newStatus) {
    if (newStatus !== STATUS.CANCELLED && newStatus !== STATUS.COMPLETED) {
      return { ok: false, error: 'Invalid status.' };
    }
    return changeStatus(id, newStatus, null);
  }

 
    // Public API

  return {
    STATUS: STATUS,

    getTurfInfo: getTurfInfo,
    getTimeSlots: getTimeSlots,

    registerCustomer: registerCustomer,
    loginCustomer: loginCustomer,
    getCurrentCustomer: getCurrentCustomer,
    logoutCustomer: logoutCustomer,

    loginAdmin: loginAdmin,
    getCurrentAdmin: getCurrentAdmin,
    logoutAdmin: logoutAdmin,
    getDemoAdminCredentials: getDemoAdminCredentials,

    getAllBookings: getAllBookings,
    getBookingsByCustomer: getBookingsByCustomer,
    getTakenSlots: getTakenSlots,
    createBookings: createBookings,
    cancelBookingForCustomer: cancelBookingForCustomer,
    updateBookingStatus: updateBookingStatus
  };
})();

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'church.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membership_no TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    marital_status TEXT,
    spouse_name TEXT DEFAULT '',
    spouse_phone TEXT DEFAULT '',
    children_info TEXT DEFAULT '[]',
    fellowship TEXT DEFAULT '',
    department TEXT DEFAULT '',
    password TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    registration_fee REAL DEFAULT 0,
    mpesa_code TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT DEFAULT '',
    status INTEGER DEFAULT 0,
    date DATE DEFAULT (date('now')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id)
  )
`);

// Migration: add status column if missing (for existing databases)
try { db.exec('ALTER TABLE contributions ADD COLUMN status INTEGER DEFAULT 0'); } catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    department TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT DEFAULT '',
    date TEXT NOT NULL,
    time TEXT DEFAULT '',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS page_content (
    page TEXT NOT NULL,
    field TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page, field)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT ''
  )
`);

// Seed departments
const deptCount = db.prepare('SELECT COUNT(*) AS c FROM departments').get().c;
if (deptCount === 0) {
  const insert = db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)');
  const departments = [
    ['KAMA', 'Kusafisha Mwili na Akili'],
    ['MU', 'Mother\'s Union'],
    ['KAYO', 'Christian Youth Organization'],
    ['Sunday School', 'Teaching children the Word of God'],
    ['Teens', 'Ministering to teenagers'],
    ['Youth', 'Ministering to young people'],
    ['Choir', 'Leading the congregation in worship through music'],
    ['Praise & Worship', 'Contemporary worship ministry'],
    ['ACWF', 'Anglican Church Women\'s Fellowship'],
    ['ACMF', 'Anglican Church Men\'s Fellowship'],
  ];
  for (const [name, desc] of departments) {
    insert.run(name, desc);
  }
}

// Seed default page content
const contentCount = db.prepare('SELECT COUNT(*) AS c FROM page_content').get().c;
if (contentCount === 0) {
  const insertContent = db.prepare('INSERT OR IGNORE INTO page_content (page, field, content) VALUES (?, ?, ?)');
  const homeFields = [
    ['hero_accent','Welcome to ACK St. Mark\'s Parish - Malaa'],
    ['hero_title','A Place to Belong, Grow, and Serve'],
    ['hero_text','We are a community of faith dedicated to loving God, loving people, and making disciples of Jesus Christ. No matter where you are on your spiritual journey, you are welcome here.'],
    ['hero_btn1_text','Register as Member'],['hero_btn1_link','portal/register'],
    ['hero_btn2_text','Plan Your Visit'],['hero_btn2_link','about.html'],
    ['welcome_title','You Are Welcome Here'],
    ['welcome_text','<p>At ACK St. Mark\'s Parish - Malaa, we believe that church is more than a building — it\'s a family. Whether you\'re exploring faith for the first time or have walked with Christ for years, you\'ll find a place to belong.</p><p>Our heart is to see lives transformed by the love of Jesus. Through authentic worship, relevant teaching, and genuine community, we strive to create an environment where you can encounter God and grow in your faith.</p><p>Come as you are. You don\'t need to have it all together — none of us do. We\'re all on a journey together.</p>'],
    ['welcome_btn_text','Get In Touch'],['welcome_btn_link','contact.html'],
    ['service_times_title','SERVICE TIMES'],['service_times_subtitle','Join us this weekend'],
    ['service1_title','SUNDAY MORNING'],['service1_name','ENGLISH SERVICE'],['service1_time','8:30 AM - 10:30 AM'],
    ['service2_title','MAIN SERVICE'],['service2_name','SWAHILI SERVICE'],['service2_time','10:30 AM - 12:30PM'],
    ['service3_title','WEDNESDAY'],['service3_name','MOTHERS\' UNION FELLOWSHIP'],['service3_time','10:00 AM'],
  ];
  for (const [f, c] of homeFields) insertContent.run('home', f, c);
  const aboutFields = [
    ['page_title','About Us'],['page_subtitle','Our story, mission, and the people who make ACK St. Mark\'s Parish - Malaa what it is'],
    ['vision_title','VISION'],['vision_text','To strengthen Anglican Church built on the foundation of the apostolic faith in Jesus Christ with the ability to equip all God\'s people to face the challenges of the new millennium.'],
    ['mission_title','MISSION'],['mission_text','To bring all people into a living relationship with God through Jesus Christ, through preaching, teaching, healing and social transformation and enabling them to grow in faith and live life in its fullness.'],
    ['pillars_title','Our Pillars'],
    ['pillar1','<strong>Scripture:</strong> The primary source of faith and the ultimate standard for doctrine.'],
    ['pillar2','<strong>Tradition:</strong> The living heritage of the church, including liturgy, creeds, and historical practices.'],
    ['pillar3','<strong>Reason:</strong> The use of intellect and experience, including insights from science and the arts, to interpret faith in contemporary contexts.'],
  ];
  for (const [f, c] of aboutFields) insertContent.run('about', f, c);
  const contactFields = [
    ['page_title','Contact Us'],['page_subtitle','We\'d love to hear from you — get in touch or stop by'],
    ['contact_intro','Have a question, prayer request, or just want to say hello? We\'d love to connect with you!'],
    ['contact_location','Malaa, Machakos, Kenya'],['contact_email','stmarks.malaa@gmail.com'],
    ['contact_phone','+254 712 345 678'],['contact_hours','Mon–Fri: 9:00 AM – 5:00 PM'],
  ];
  for (const [f, c] of contactFields) insertContent.run('contact', f, c);
  const eventsFields = [
    ['page_title','Events'],['page_subtitle','Stay connected with everything happening at ACK St. Mark\'s Parish - Malaa'],
    ['section_title','Upcoming Events'],['section_subtitle','There\'s always something happening — join us'],
  ];
  for (const [f, c] of eventsFields) insertContent.run('events', f, c);
}

// Seed default events
const eventCount = db.prepare('SELECT COUNT(*) AS c FROM events').get().c;
if (eventCount === 0) {
  const insert = db.prepare('INSERT INTO events (title, description, location, date, time, created_by) VALUES (?, ?, ?, ?, ?, ?)');
  const events = [
    ['Community BBQ & Fellowship', 'Join us for food, games, and great company! Bring the whole family for an afternoon of fun and connection.', 'Church Lawn', '2026-05-31', '12:00 PM - 3:00 PM', 1],
    ['Summer Youth Retreat', 'An unforgettable weekend for students grades 6-12. Worship, teaching, and outdoor activities.', 'Camp Pine Valley', '2026-06-07', 'Fri 4 PM - Sun 2 PM', 1],
    ['Women\'s Brunch', 'All women are invited for a morning of encouragement, delicious food, and meaningful connection.', 'Fellowship Hall', '2026-06-14', '10:00 AM - 12:00 PM', 1],
    ['Father\'s Day Service', 'A special service honoring fathers and celebrating the impact of godly leadership in our families.', 'Main Sanctuary', '2026-06-21', '10:45 AM', 1],
    ['Worship Night', 'An evening of extended worship, prayer, and seeking God together as a church family.', 'Main Sanctuary', '2026-06-28', '6:30 PM - 8:00 PM', 1],
  ];
  for (const e of events) insert.run(...e);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    target_fellowship TEXT DEFAULT '',
    can_manage_members INTEGER DEFAULT 0,
    can_manage_contributions INTEGER DEFAULT 0,
    can_manage_announcements INTEGER DEFAULT 0,
    can_manage_admins INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Seed default admins
const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
if (adminCount === 0) {
  const hash = require('bcryptjs').hashSync;
  const admins = [
    ['admin', hash('admin123', 10), 'Super Admin', 'superadmin', '', 1, 1, 1, 1],
    ['vicar', hash('vicar123', 10), 'Vicar', 'vicar', '', 1, 1, 1, 1],
    ['treasurer', hash('treasurer123', 10), 'Treasurer', 'treasurer', '', 0, 1, 0, 0],
    ['secretary', hash('secretary123', 10), 'Secretary', 'secretary', '', 1, 0, 1, 0],
    ['vice_chairman', hash('vice_chairman123', 10), 'Vice Chairman', 'vice_chairman', '', 1, 1, 1, 0],
    ['fl_nazareth', hash('fellowship123', 10), 'Nazareth Fellowship Leader', 'fellowship_leader', 'Nazareth', 1, 0, 1, 0],
    ['fl_jerusalem', hash('fellowship123', 10), 'Jerusalem Fellowship Leader', 'fellowship_leader', 'Jerusalem', 1, 0, 1, 0],
    ['fl_judea', hash('fellowship123', 10), 'Judea Fellowship Leader', 'fellowship_leader', 'Judea', 1, 0, 1, 0],

  ];
  const insert = db.prepare(`INSERT INTO admins (username, password, full_name, role, target_fellowship, can_manage_members, can_manage_contributions, can_manage_announcements, can_manage_admins) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const a of admins) insert.run(...a);
}

// Migration: update treasurer can_manage_members to 1 (was 0 in old seed)
db.prepare("UPDATE admins SET can_manage_members = 1 WHERE role = 'treasurer' AND can_manage_members = 0").run();

// Migration: clear target_fellowship for non-fellowship-leader roles
db.prepare("UPDATE admins SET target_fellowship = '' WHERE role NOT IN ('fellowship_leader') AND target_fellowship != ''").run();

// Migration: remove Church School department
db.prepare("DELETE FROM departments WHERE name = 'Church School'").run();
db.prepare("UPDATE members SET department = '' WHERE department = 'Church School'").run();

// Migration: reset existing registration fee contributions to pending (status=0)
db.prepare("UPDATE contributions SET status = 0 WHERE type = 'Registration Fee' AND status = 1").run();

// Seed sample announcement
const annCount = db.prepare('SELECT COUNT(*) AS c FROM announcements').get().c;
if (annCount === 0) {
  db.prepare('INSERT INTO announcements (title, body) VALUES (?, ?)').run(
    'Welcome to ACK St. Mark\'s Parish - Malaa',
    'We are excited to have you join our church family. Stay tuned for upcoming events and services.'
  );
}

// Migration: update fellowship_leader can_manage_announcements to 1
db.prepare("UPDATE admins SET can_manage_announcements = 1 WHERE role = 'fellowship_leader' AND can_manage_announcements = 0").run();

// Migration: set can_manage_contributions=0 for peoples_warden and vicars_warden
db.prepare("UPDATE admins SET can_manage_contributions = 0 WHERE role IN ('peoples_warden', 'vicars_warden') AND can_manage_contributions = 1").run();

db.exec(`
  CREATE TABLE IF NOT EXISTS finance_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'finance_user',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS finance_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('collection', 'income', 'expense')),
    category TEXT DEFAULT '',
    amount REAL NOT NULL,
    description TEXT DEFAULT '',
    entry_date DATE DEFAULT (date('now')),
    created_by INTEGER,
    edited_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES finance_users(id)
  )
`);
try { db.exec('ALTER TABLE finance_entries ADD COLUMN cheque_no TEXT DEFAULT \'\''); } catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS collection_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Seed collection categories
const catCount = db.prepare('SELECT COUNT(*) AS c FROM collection_categories').get().c;
if (catCount === 0) {
  const insert = db.prepare('INSERT INTO collection_categories (name) VALUES (?)');
  const cats = [
    'English Service Offering',
    'Swahili Service Offering',
    'Tithe',
    'Thanksgiving',
    'Baptism',
    'Confirmation',
    'Registration',
    'KAMA Enrollment',
    "Mother's Union Enrollment",
    'Sunday School Offering',
    'Special Offering',
    'Pastoral Offering',
    'Development',
    'Tent Hiring',
    'Burial Offering',
    'Wedding Offering',
    'Nazareth Day',
    'Jerusalem Day',
    'Judea Day',
    'Choir Day',
    'Mission & Evangelism Day',
    'Daughter Church Collection',
    'Easter Gift',
    'Christmas Gift',
    'Clergy Day',
    'M-Pesa',
    'Mustard Seed',
    'KAYO Enrollment',
    'KAYO Day',
  ];
  for (const c of cats) insert.run(c);
}

// Migration: add missing collection categories for existing DBs
const extraCats = ['Easter Gift', 'Christmas Gift', 'Clergy Day', 'M-Pesa', 'Mustard Seed', 'KAYO Enrollment', 'KAYO Day'];
for (const name of extraCats) {
  try { db.prepare('INSERT INTO collection_categories (name) VALUES (?)').run(name); } catch (e) {}
}

db.exec(`
  CREATE TABLE IF NOT EXISTS expenditure_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const expCount = db.prepare('SELECT COUNT(*) AS c FROM expenditure_items').get().c;
if (expCount === 0) {
  const insert = db.prepare('INSERT INTO expenditure_items (name) VALUES (?)');
  const items = [
    "Diocesan Quota",
    "Audit fee & Accountacy",
    "Archdeaoconry Quota",
    "Appreciations & Gifts",
    "Church Wine and waifers",
    "Finance charges",
    "Depreciation",
    "Donations and contributions",
    "Electricity expenses",
    "Local transport & travel",
    "Honoraria Expenses",
    "Salaries",
    "Printing and stationery",
    "Petty Cash",
    "Rent expenses",
    "Repairs and Maintenance",
    "Sunday School Quota",
    "Telephone and Postages",
    "Water expenses",
    "Pastoral, Mission and evangelism",
    "Praise and worship expenses",
    "Welfare and hospitality",
  ];
  for (const item of items) insert.run(item);
}

// Migration: rename old expenditure item names
db.prepare("UPDATE expenditure_items SET name = 'Diocesan Quota' WHERE name = '14% Diocesan Synod of Nairobi'").run();
db.prepare("UPDATE expenditure_items SET name = 'Sunday School Quota' WHERE name = '30% Sunday school / Teens pay'").run();
db.prepare("UPDATE expenditure_items SET name = 'Archdeaoconry Quota' WHERE name = 'Parish quota Allocations'").run();
// Capitalize already-renamed items (from lowercase to title case)
db.prepare("UPDATE expenditure_items SET name = 'Diocesan Quota' WHERE name = 'diocesan quota'").run();
db.prepare("UPDATE expenditure_items SET name = 'Archdeaoconry Quota' WHERE name = 'archdeaoconry quota'").run();
db.prepare("UPDATE expenditure_items SET name = 'Sunday School Quota' WHERE name = 'sunday school quota'").run();
// Add Petty Cash if missing
try { db.prepare("INSERT INTO expenditure_items (name) VALUES ('Petty Cash')").run(); } catch (e) {}
// Replace Covid response with Salaries
try { db.prepare("UPDATE expenditure_items SET name = 'Salaries' WHERE name = 'Covid response expenses'").run(); } catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS petty_cash_cheques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    balance REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    created_by INTEGER,
    FOREIGN KEY (created_by) REFERENCES finance_users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS petty_cash (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cheque_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    entry_date DATE DEFAULT (date('now')),
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cheque_id) REFERENCES petty_cash_cheques(id),
    FOREIGN KEY (created_by) REFERENCES finance_users(id)
  )
`);
try { db.exec('ALTER TABLE petty_cash ADD COLUMN cheque_id INTEGER REFERENCES petty_cash_cheques(id)'); } catch (e) {};

db.exec(`
  CREATE TABLE IF NOT EXISTS petty_cash_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const pciCount = db.prepare('SELECT COUNT(*) AS c FROM petty_cash_items').get().c;
if (pciCount === 0) {
  const insert = db.prepare('INSERT INTO petty_cash_items (name) VALUES (?)');
  const items = ['Transport', 'Tea / Refreshments', 'Stationery', 'Cleaning Supplies', 'Printing', 'Airtime', 'Bottled Water', 'Office Supplies', 'Miscellaneous',
    'Fuel', 'Car Wash', 'Parking Fees', 'Toll Fees', 'Meals', 'Drinking Water', 'Sugar', 'Milk', 'Cooking Oil', 'Rice', 'Flour',
    'Vegetables', 'Soap', 'Detergent', 'Disinfectant', 'Tissue Paper', 'Trash Bags', 'Light Bulbs', 'Batteries',
    'Internet / WiFi', 'Printer Ink / Toner', 'Binding & Lamination', 'Photocopying', 'Pens & Markers', 'Notebooks',
    'Envelopes', 'File Folders', 'Staples & Paper Clips', 'Masking Tape', 'Glue', 'Scissors', 'Cutter',
    'Plates & Cups', 'Cutlery', 'Serving Trays', 'Tablecloths', 'Napkins', 'Match Box', 'Incense / Air Freshener',
    'First Aid Supplies', 'Painkillers', 'Bandages', 'Gloves', 'Hand Sanitizer',
    'Flowers / Decorations', 'Birthday / Event Supplies',
    'Locks & Keys', 'Repair Tools', 'Paint', 'Nails & Screws', 'PVC Pipes', 'Cement', 'Timber',
    'Garden Supplies', 'Watering Can', 'Seeds / Seedlings', 'Fertilizer',
    'Petty Cash Envelope', 'Bank Charges', 'Stamp Duty',
  ];
  for (const item of items) insert.run(item);
};

db.exec(`
  CREATE TABLE IF NOT EXISTS development (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    entry_date DATE DEFAULT (date('now')),
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES finance_users(id)
  )
`);

// Migration: add permission columns to finance_users
try { db.exec('ALTER TABLE finance_users ADD COLUMN can_manage_entries INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE finance_users ADD COLUMN can_manage_petty_cash INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE finance_users ADD COLUMN can_manage_development INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE finance_users ADD COLUMN can_manage_users INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE finance_users ADD COLUMN can_view_reports INTEGER DEFAULT 0'); } catch (e) {}

// Set permissions based on role for existing users
db.prepare("UPDATE finance_users SET can_manage_entries=1, can_manage_petty_cash=1, can_manage_development=1, can_manage_users=1, can_view_reports=1 WHERE role='finance_admin' AND can_manage_entries=0").run();
db.prepare("UPDATE finance_users SET can_view_reports=1 WHERE role='finance_manager' AND can_view_reports=0").run();
db.prepare("UPDATE finance_users SET can_manage_entries=1, can_manage_petty_cash=1, can_manage_development=1, can_manage_users=1, can_view_reports=1 WHERE role='finance_superadmin'").run();

// Seed default finance admin
const finUserCount = db.prepare('SELECT COUNT(*) AS c FROM finance_users').get().c;
if (finUserCount === 0) {
  db.prepare('INSERT INTO finance_users (username, password, full_name, role, can_manage_entries, can_manage_petty_cash, can_manage_development, can_manage_users, can_view_reports) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'finance', require('bcryptjs').hashSync('finance123', 10), 'Finance Admin', 'finance_admin', 1, 1, 1, 1, 1
  );
}

db.exec(`
  CREATE TABLE IF NOT EXISTS change_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    field TEXT NOT NULL,
    current_value TEXT DEFAULT '',
    requested_value TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id),
    FOREIGN KEY (reviewed_by) REFERENCES admins(id)
  )
`);

module.exports = db;

import type { InstitutionType, Region } from "@prisma/client";

// All names here are synthetic. Bank names are real institutions used only as
// plausible labels on made-up records.

export const STATES: { state: string; region: Region; cities: string[] }[] = [
  { state: "Delhi", region: "NORTH", cities: ["New Delhi", "Dwarka"] },
  { state: "Uttar Pradesh", region: "NORTH", cities: ["Lucknow", "Noida", "Kanpur", "Varanasi"] },
  { state: "Punjab", region: "NORTH", cities: ["Ludhiana", "Amritsar"] },
  { state: "Haryana", region: "NORTH", cities: ["Gurugram", "Hisar"] },
  { state: "Rajasthan", region: "NORTH", cities: ["Jaipur", "Jodhpur"] },
  { state: "Tamil Nadu", region: "SOUTH", cities: ["Chennai", "Coimbatore", "Madurai"] },
  { state: "Karnataka", region: "SOUTH", cities: ["Bengaluru", "Mysuru", "Mangaluru"] },
  { state: "Kerala", region: "SOUTH", cities: ["Kochi", "Thiruvananthapuram"] },
  { state: "Telangana", region: "SOUTH", cities: ["Hyderabad", "Warangal"] },
  { state: "Andhra Pradesh", region: "SOUTH", cities: ["Visakhapatnam", "Vijayawada"] },
  { state: "West Bengal", region: "EAST", cities: ["Kolkata", "Durgapur"] },
  { state: "Odisha", region: "EAST", cities: ["Bhubaneswar", "Rourkela"] },
  { state: "Bihar", region: "EAST", cities: ["Patna", "Gaya"] },
  { state: "Jharkhand", region: "EAST", cities: ["Ranchi", "Jamshedpur"] },
  { state: "Maharashtra", region: "WEST", cities: ["Mumbai", "Pune", "Nagpur", "Nashik"] },
  { state: "Gujarat", region: "WEST", cities: ["Ahmedabad", "Surat", "Vadodara"] },
  { state: "Goa", region: "WEST", cities: ["Panaji"] },
  { state: "Madhya Pradesh", region: "CENTRAL", cities: ["Bhopal", "Indore"] },
  { state: "Chhattisgarh", region: "CENTRAL", cities: ["Raipur", "Bhilai"] },
  { state: "Assam", region: "NORTH_EAST", cities: ["Guwahati", "Jorhat"] },
  { state: "Meghalaya", region: "NORTH_EAST", cities: ["Shillong"] },
];

export const BANKS: { name: string; ifscPrefix: string }[] = [
  { name: "State Bank of India", ifscPrefix: "SBIN" },
  { name: "Punjab National Bank", ifscPrefix: "PUNB" },
  { name: "Bank of Baroda", ifscPrefix: "BARB" },
  { name: "Canara Bank", ifscPrefix: "CNRB" },
  { name: "Union Bank of India", ifscPrefix: "UBIN" },
  { name: "Bank of India", ifscPrefix: "BKID" },
  { name: "Indian Bank", ifscPrefix: "IDIB" },
  { name: "Central Bank of India", ifscPrefix: "CBIN" },
  { name: "HDFC Bank", ifscPrefix: "HDFC" },
  { name: "ICICI Bank", ifscPrefix: "ICIC" },
  { name: "Axis Bank", ifscPrefix: "UTIB" },
];

export const NAME_PREFIXES = [
  "Aryabhatta", "Saraswati", "Vivekananda", "Sagar", "Himalaya", "Narmada", "Kaveri", "Ganga",
  "Sahyadri", "Vindhya", "Godavari", "Pragati", "Gyan Jyoti", "Shanti Niketan", "Lakshya", "Navodaya",
  "Bharati", "Ashoka", "Tagore", "Raman",
];

export const TYPE_NAMES: { type: InstitutionType; suffix: string }[] = [
  { type: "ENGINEERING", suffix: "Institute of Technology" },
  { type: "ENGINEERING", suffix: "College of Engineering" },
  { type: "MANAGEMENT", suffix: "School of Management" },
  { type: "PHARMACY", suffix: "College of Pharmacy" },
  { type: "ARCHITECTURE", suffix: "School of Architecture" },
  { type: "POLYTECHNIC", suffix: "Polytechnic" },
];

export const CONTACT_NAMES = [
  "Registrar Office", "Accounts Section", "Principal's Office", "Establishment Section", "Finance Officer",
];

export const BRANCH_SUFFIXES = ["Main Branch", "Civil Lines", "Station Road", "University Road", "City Centre"];

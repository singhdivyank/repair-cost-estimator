// Defines the 5 sections / 19 groups from the Spark Homes brief, and which
// room types get their own instanced copy of a group vs. sharing one
// whole-house instance.
//
// Design note: "Flooring", "Paint & Wall Repair" and "Doors" are shared group
// NAMES across three different contexts:
//   1. A single whole-house "Interior / General" instance (hallways, shared
//      areas, whole-structure items not tied to one room)
//   2. Each individual Bedroom instance
//   3. Each individual Living / Common Area instance
// The item catalog for a group (e.g. all "Flooring" line items) is the same
// regardless of which instance hosts it — see pricingService.getItemsForGroup.

export const SECTION = {
  INTERIOR_GENERAL: 'Interior / General',
  KITCHEN: 'Kitchen',
  BATHROOMS: 'Bathrooms',
  SYSTEMS_STRUCTURE: 'Systems & Structure',
  EXTERIOR: 'Exterior',
};

// The 19 required groups, keyed by section. Order here is the display order.
export const SECTION_GROUPS = {
  [SECTION.INTERIOR_GENERAL]: ['Flooring', 'Paint & Wall Repair', 'Doors', 'Pest Control'],
  [SECTION.KITCHEN]: ['Cabinets', 'Countertops & Tile', 'Appliances'],
  [SECTION.BATHROOMS]: ['Vanity & Countertop', 'Tub & Shower', 'Tile'],
  [SECTION.SYSTEMS_STRUCTURE]: ['HVAC', 'Electrical', 'Structural', 'Insulation & Drywall'],
  [SECTION.EXTERIOR]: ['Fence', 'Siding', 'Windows', 'Garage', 'Trees'],
};

// Whole-house "rooms" — always present exactly once per project, not
// deletable, not duplicable. These carry the Interior/General, Systems &
// Structure, and Exterior groups.
export const WHOLE_HOUSE_ROOMS = [
  { type: 'whole_house_interior', name: 'Interior / General', section: SECTION.INTERIOR_GENERAL, singleton: true },
  { type: 'whole_house_systems', name: 'Systems & Structure', section: SECTION.SYSTEMS_STRUCTURE, singleton: true },
  { type: 'whole_house_exterior', name: 'Exterior', section: SECTION.EXTERIOR, singleton: true },
];

// Adjustable room types agents can freely add/remove during a walkthrough.
// Each entry defines the groups that get created for every instance of that
// room type, plus display metadata.
export const ROOM_TYPES = {
  bathroom: {
    label: 'Bathroom',
    section: SECTION.BATHROOMS,
    groups: ['Vanity & Countertop', 'Tub & Shower', 'Tile'],
    icon: 'bath',
    maxRecommended: 6,
  },
  kitchen: {
    label: 'Kitchen',
    section: SECTION.KITCHEN,
    groups: ['Cabinets', 'Countertops & Tile', 'Appliances'],
    icon: 'kitchen',
    maxRecommended: 2,
  },
  bedroom: {
    label: 'Bedroom',
    section: null, // per-instance section; totals roll up under "Bedrooms" in summary
    groups: ['Flooring', 'Paint & Wall Repair', 'Doors', 'Closet'],
    icon: 'bed',
    maxRecommended: 8,
  },
  living: {
    label: 'Living Area',
    section: null,
    groups: ['Flooring', 'Paint & Wall Repair', 'Doors', 'Lighting'],
    icon: 'sofa',
    maxRecommended: 8,
  },
};

// Groups that don't map to a repair-line-item catalog group (Closet, Lighting)
// because they're new subdivisions of existing per-room work rather than
// whole different catalogs. They still get a "No Action Needed" toggle and
// can hold custom (user-added) line items even with no seeded defaults.
export const CATALOG_LESS_GROUPS = new Set(['Closet', 'Lighting']);

export function allGroupNames() {
  const names = new Set();
  Object.values(SECTION_GROUPS).forEach((groups) => groups.forEach((g) => names.add(g)));
  Object.values(ROOM_TYPES).forEach((rt) => rt.groups.forEach((g) => names.add(g)));
  return Array.from(names);
}

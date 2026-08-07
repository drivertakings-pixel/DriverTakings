// Maps DriverTakings' expense categories (expenseMap in assets/app.js) to
// HMRC Self Employment Business (MTD) 5.0's cumulative-period expense
// fields, so a driver's own categorisation drops straight into the right
// HMRC box without re-entering anything by hand.
//
// This is a working mapping, not a fixed spec -- change any line below if
// it needs adjusting (accountant input, HMRC rule changes, whatever). The
// review screen in app/mtd/index.html always shows the grouped figures in
// plain English before a submission goes anywhere, which is the real
// safety net -- this table doesn't need to be treated as precious.
//
// A display-only mirror of this table renders the review screen (no shared-
// module path exists between server Functions and the un-bundled browser
// code in this repo) -- if you change one, change both. The submission
// function always recomputes from *this* copy regardless of what the
// client displayed.

const CATEGORY_MAP = {
  fuel: 'carVanTravelExpenses',
  car_wash: 'carVanTravelExpenses',
  repairs_servicing: 'carVanTravelExpenses',
  tyres: 'carVanTravelExpenses',
  vehicle_rental: 'carVanTravelExpenses',
  vehicle_finance: 'carVanTravelExpenses',
  insurance: 'carVanTravelExpenses',
  parking_tolls_business_travel: 'carVanTravelExpenses',
  cleaning_supplies: 'carVanTravelExpenses',
  licensing: 'carVanTravelExpenses',
  operator_platform_fees: 'professionalFees',
  payment_fees: 'financeCharges',
  phone_data: 'adminCosts',
  apps_software: 'adminCosts',
  equipment: 'otherExpenses',
  advertising: 'advertisingCosts',
  professional_accountancy: 'professionalFees',
  training: 'otherExpenses',
  home_working: 'premisesRunningCosts',
  fine_penalty: 'otherExpenses', // routed to otherExpensesDisallowable at aggregation time, not claimed
  other: 'otherExpenses'
};

// Every HMRC category field this map can produce, plus its parallel
// Disallowable field -- used to initialise a zeroed totals object before
// aggregation, so every field is present in the submission payload even at
// £0 rather than only appearing when non-zero.
const HMRC_EXPENSE_FIELDS = [
  'costOfGoods', 'paymentsToSubcontractors', 'wagesAndStaffCosts', 'carVanTravelExpenses',
  'premisesRunningCosts', 'maintenanceCosts', 'adminCosts', 'businessEntertainmentCosts',
  'advertisingCosts', 'interestOnBankOtherLoans', 'financeCharges', 'irrecoverableDebts',
  'professionalFees', 'depreciation', 'otherExpenses'
];

module.exports = {CATEGORY_MAP, HMRC_EXPENSE_FIELDS};

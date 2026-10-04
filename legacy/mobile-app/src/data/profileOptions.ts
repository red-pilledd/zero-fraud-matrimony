export const RELIGIONS = [
  'Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist', 'Parsi', 'Other',
];

export const CASTES_BY_RELIGION: Record<string, string[]> = {
  Hindu:    ['Nair', 'Ezhava', 'Namboothiri', 'Pillai', 'Chettiar', 'Nadar',
             'Mudaliar', 'Gounder', 'Reddy', 'Brahmin', 'Kshatriya', 'Vaishya', 'Other'],
  Muslim:   ['Sunni', 'Shia', 'Mujahid', 'Ahmadiyya', 'Other'],
  Christian:['Latin Catholic', 'Syrian Catholic', 'CSI', 'Marthoma',
             'Pentecost', 'Jacobite', 'Other'],
  Sikh:     ['Jat', 'Khatri', 'Arora', 'Ramgarhia', 'Other'],
  Jain:     ['Digambara', 'Shvetambara', 'Other'],
  Buddhist: ['Theravada', 'Mahayana', 'Other'],
  Parsi:    ['Parsi'],
  Other:    ['Other'],
};

export const MARITAL_STATUS = [
  'Never Married', 'Divorced', 'Widowed', 'Awaiting Divorce',
];

export const MOTHER_TONGUES = [
  'Malayalam', 'Tamil', 'Telugu', 'Hindi', 'Kannada', 'Bengali',
  'Marathi', 'Gujarati', 'Punjabi', 'Urdu', 'Sinhala', 'Other',
];

export const EDUCATION_LEVELS = [
  "High School", "Diploma", "Bachelor's", "Master's",
  "PhD", "Professional Degree", "Other",
];

export const OCCUPATIONS = [
  'IT/Software', 'Healthcare', 'Business/Self-employed', 'Finance',
  'Engineering', 'Education', 'Government', 'Legal', 'Arts/Media', 'Other',
];

export const INCOME_INR = ['Below 3L', '3–6L', '6–12L', '12–25L', '25–50L', '50L+'];
export const INCOME_USD = ['Below $30k', '$30–60k', '$60–100k', '$100–150k', '$150k+'];

export const DIET_OPTIONS = [
  'Vegetarian', 'Non-Vegetarian', 'Eggetarian', 'Vegan',
  'Jain Vegetarian', 'No Preference',
];

export const NATIONALITIES = [
  'Indian', 'British', 'American', 'Canadian', 'Australian',
  'UAE', 'Malaysian', 'Singaporean', 'Other',
];

export const COUNTRIES = [
  'India', 'United Kingdom', 'United States', 'Canada', 'Australia',
  'UAE', 'Malaysia', 'Singapore', 'Other',
];

export const INDIAN_STATES = [
  'Kerala', 'Tamil Nadu', 'Karnataka', 'Andhra Pradesh', 'Telangana',
  'Maharashtra', 'Gujarat', 'Rajasthan', 'Punjab', 'Delhi',
  'West Bengal', 'Other',
];

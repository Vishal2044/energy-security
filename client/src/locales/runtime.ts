import { useSyncExternalStore } from 'react';

export type Language = 'en' | 'gu';
const STORAGE_KEY = 'dg-language';
const LANGUAGE_EVENT = 'dg-language-change';

function isLanguage(value: string | null): value is Language { return value === 'en' || value === 'gu'; }
export function getLanguage(): Language { if (typeof window === 'undefined') return 'en'; const value = window.localStorage.getItem(STORAGE_KEY); return isLanguage(value) ? value : 'en'; }
export function setLanguage(language: Language) { if (typeof window !== 'undefined') { window.localStorage.setItem(STORAGE_KEY, language); window.dispatchEvent(new Event(LANGUAGE_EVENT)); } }
function subscribeLanguage(listener: () => void) { if (typeof window === 'undefined') return () => undefined; window.addEventListener(LANGUAGE_EVENT, listener); window.addEventListener('storage', listener); return () => { window.removeEventListener(LANGUAGE_EVENT, listener); window.removeEventListener('storage', listener); }; }
export function useLanguage() { return useSyncExternalStore(subscribeLanguage, getLanguage, () => 'en' as Language); }
export function toggleLanguage(language: Language): Language { return language === 'en' ? 'gu' : 'en'; }

const semanticValues: Record<string, [string, string]> = {
  ACTIVE: ['Active', 'સક્રિય'], INACTIVE: ['Inactive', 'નિષ્ક્રિય'], SUSPENDED: ['Suspended', 'સ્થગિત'], RESIGNED: ['Resigned', 'રાજીનામું'], EXITED: ['Exited', 'બહાર થયેલ'],
  PENDING: ['Pending', 'બાકી'], MANUAL_REVIEW: ['Manual review', 'મેન્યુઅલ સમીક્ષા'], VERIFIED: ['Verified', 'ચકાસાયેલ'], REJECTED: ['Rejected', 'નકારેલ'], APPROVED: ['Approved', 'મંજૂર'],
  COMPLETED: ['Completed', 'પૂર્ણ'], OPEN: ['Open', 'ખુલ્લું'], ACKNOWLEDGED: ['Acknowledged', 'સ્વીકારેલ'], RESOLVED: ['Resolved', 'ઉકેલાયેલ'], CANCELLED: ['Cancelled', 'રદ કરેલ'],
  PAID: ['Paid', 'ચૂકવેલ'], UNPAID: ['Unpaid', 'ચૂકવવાનું બાકી'], DRAFT: ['Draft', 'ડ્રાફ્ટ'], LOCKED: ['Locked', 'લૉક કરેલ'], RECONCILED: ['Reconciled', 'મેળવેલ'],
  SHIFT_START: ['Shift start', 'શિફ્ટ શરૂ'], SHIFT_END: ['Shift end', 'શિફ્ટ પૂર્ણ'], RANDOM_VERIFICATION: ['Random verification', 'આકસ્મિક ચકાસણી'],
  HIGH: ['High', 'ઉચ્ચ'], MEDIUM: ['Medium', 'મધ્યમ'], LOW: ['Low', 'નીચું'], CRITICAL: ['Critical', 'ગંભીર'], NORMAL: ['Normal', 'સામાન્ય'], EMERGENCY: ['Emergency', 'કટોકટી'],
  ADMIN: ['Admin', 'એડમિન'], MAIN_SECURITY: ['Main Security', 'મુખ્ય સુરક્ષા'], GUARD: ['Guard', 'ગાર્ડ'], WIND: ['Wind', 'વિન્ડ'], SOLAR: ['Solar', 'સોલાર'], STORE: ['Store', 'સ્ટોર'], OTHER: ['Other', 'અન્ય'],
  AADHAAR: ['Aadhaar', 'આધાર'], BANK_PASSBOOK: ['Bank passbook', 'બેંક પાસબુક'], USER_PHOTO: ['Profile photo', 'પ્રોફાઇલ ફોટો'],
};
const commonText: Record<string, string> = {
  Dashboard: 'ડેશબોર્ડ', Operations: 'કામગીરી', Guards: 'ગાર્ડ્સ', Sites: 'સાઇટ્સ', Attendance: 'હાજરી', Incidents: 'ઘટનાઓ', Salary: 'પગાર', Documents: 'દસ્તાવેજો',
  'No guards found': 'કોઈ ગાર્ડ મળ્યો નથી', 'No attendance records': 'હાજરીના રેકોર્ડ નથી', 'No sites configured': 'કોઈ સાઇટ ગોઠવેલ નથી', 'No documents awaiting review': 'સમીક્ષા માટે દસ્તાવેજો નથી', 'No open incidents': 'કોઈ ખુલ્લી ઘટના નથી',
  'No information yet.': 'હજી કોઈ માહિતી નથી.', 'Loading…': 'માહિતી લાવવામાં આવી રહી છે…', 'Try again': 'ફરી પ્રયાસ કરો', 'Search records…': 'રેકોર્ડ શોધો…',
  'Review your assigned site, shift time and acknowledgement status.': 'તમારી સોંપાયેલી સાઇટ, શિફ્ટનો સમય અને સ્વીકૃતિની સ્થિતિ જુઓ.', 'Keep every field issue visible until it is resolved.': 'દરેક ક્ષેત્રની સમસ્યા ઉકેલાય ત્યાં સુધી દેખરેખમાં રાખો.',
};

export function translateValue(value: string | undefined | null, language: Language) {
  if (!value) return '—';
  const translated = semanticValues[value.toUpperCase().replaceAll(' ', '_')];
  if (translated) return translated[language === 'en' ? 0 : 1];
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export function translateText(value: string | undefined, language: Language) { if (!value || language === 'en') return value; return commonText[value] ?? value; }

export function formatDateTime(value: string | Date | undefined, language: Language, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(language === 'gu' ? 'gu-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short', ...options }).format(new Date(value));
}

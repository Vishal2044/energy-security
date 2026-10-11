export const guardCopy = {
  gu: {
    home: 'હોમ', attendance: 'હાજરી', salary: 'પગાર', documents: 'દસ્તાવેજો', notifications: 'સૂચનાઓ', profile: 'મારી માહિતી', logout: 'બહાર નીકળો',
    startDuty: 'ફરજ શરૂ કરો', dutyNotStarted: 'આજની ફરજ શરૂ થઈ નથી', dutyActive: 'ફરજ ચાલુ છે', dutyCompleted: 'આજની ફરજ પૂર્ણ થઈ', endDuty: 'ફરજ પૂર્ણ કરો', verify: 'હાજરી આપો', verification: 'હાજરી ચકાસણી', reportProblem: 'સમસ્યાની જાણ કરો', myAttendance: 'મારી હાજરી', mySalary: 'મારો પગાર', myDocuments: 'મારા દસ્તાવેજો', myNotifications: 'સૂચનાઓ', myProfile: 'મારી માહિતી',
    offline: 'ઇન્ટરનેટ નથી', offlineSaved: 'માહિતી ફોનમાં સાચવાઈ છે. નેટવર્ક આવ્યા પછી મોકલાશે.', retry: 'ફરી પ્રયાસ કરો', alreadyActive: 'તમારી ફરજ પહેલેથી ચાલુ છે.', noActiveShift: 'હાલ કોઈ ફરજ ચાલુ નથી.', verificationExpired: 'આ હાજરી ચકાસણીનો સમય પૂરો થઈ ગયો છે.',
    currentSite: 'તમારી સોંપાયેલી સાઇટ', windSite: 'વિન્ડ ટર્બાઇન સાઇટ', startedAt: 'શરૂઆત', completedAt: 'પૂર્ણ સમય', saved: 'માહિતી સાચવાઈ ગઈ છે.', success: 'સફળ', loading: 'માહિતી લાવવામાં આવી રહી છે…', noRecords: 'હજી કોઈ માહિતી નથી.', paid: 'ચૂકવેલ', pending: 'બાકી', submitted: 'તમારો અહેવાલ મોકલાયો છે.', documentsReady: 'મોકલેલ', documentsMissing: 'હજી જરૂરી', readAll: 'બધું વાંચેલું કરો', changePassword: 'પાસવર્ડ બદલો', currentPassword: 'હાલનો પાસવર્ડ', newPassword: 'નવો પાસવર્ડ', savePassword: 'પાસવર્ડ સાચવો',
  },
  en: {
    home: 'Home', attendance: 'Attendance', salary: 'Salary', documents: 'Documents', notifications: 'Notifications', profile: 'Profile', logout: 'Sign out',
    startDuty: 'Start duty', dutyNotStarted: "Today's duty has not started", dutyActive: 'Duty is active', dutyCompleted: "Today's duty is complete", endDuty: 'End duty', verify: 'Submit attendance', verification: 'Attendance check', reportProblem: 'Report a problem', myAttendance: 'My attendance', mySalary: 'My salary', myDocuments: 'My documents', myNotifications: 'Notifications', myProfile: 'My profile',
    offline: 'No internet', offlineSaved: 'Saved on this phone. It will send when the network returns.', retry: 'Try again', alreadyActive: 'Your duty is already active.', noActiveShift: 'No active duty right now.', verificationExpired: 'This attendance check has expired.',
    currentSite: 'Your assigned site', windSite: 'Wind turbine site', startedAt: 'Started', completedAt: 'Completed', saved: 'Information saved.', success: 'Success', loading: 'Loading…', noRecords: 'No information yet.', paid: 'Paid', pending: 'Pending', submitted: 'Your report was submitted.', documentsReady: 'Submitted', documentsMissing: 'Still required', readAll: 'Mark all read', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password', savePassword: 'Save password',
  },
} as const;

export const attendanceCopy = {
  gu: { submitFailed: 'હાજરી મોકલી શકાઈ નથી. ફરી પ્રયાસ કરો.' },
  en: { submitFailed: 'Attendance could not be submitted. Please try again.' },
} as const;

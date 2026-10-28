// Select finishSignupSetup in the Apps Script editor and click Run.
// This file contains no secret values. Anonymous/other users cannot run setup.
function finishSignupSetup() {
  const active = Session.getActiveUser().getEmail();
  const owner = Session.getEffectiveUser().getEmail();
  if (!active || active !== owner) throw new Error('Run setup in the project owner editor.');
  const result = setupSignup_();
  console.log('Private subscriber Sheet: https://docs.google.com/spreadsheets/d/' + result.spreadsheetId + '/edit');
  console.log(result.signupsEnabled ? 'Signup setup complete.' : 'Setup complete. Set SIGNUPS_ENABLED=true when ready to accept signups.');
}

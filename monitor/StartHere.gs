// Configure bridge Script Properties, then select finishMonitorSetup and Run.
// This file contains no secret values. Existing LMS settings/trigger are kept.
function finishMonitorSetup() {
  const active = Session.getActiveUser().getEmail();
  const owner = Session.getEffectiveUser().getEmail();
  if (!active || active !== owner) throw new Error('Run setup in the project owner editor.');
  const store = PropertiesService.getScriptProperties();
  store.setProperty('SUBSCRIBER_ALERTS_ENABLED', 'false');
  setupSubscriberBridge_();
  mcSetup_();mcEnsureTriggers_();
  store.setProperty('SUBSCRIBER_ALERTS_ENABLED', 'true');
  console.log('Monitor connected to verified subscribers.');
  console.log('Existing LMS settings, event fingerprints and checkLms trigger preserved.');
}

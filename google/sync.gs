// Script Google che gira da solo nel tuo account Sapienza.
// Legge il calendario (prossime 3 settimane) e le mail dell'ultima settimana,
// e le manda alla funzione "sync" di Supabase. Non modifica nulla in Gmail o nel calendario.
function sync() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('SYNC_URL'), secret = p.getProperty('SYNC_SECRET');
  var tz = 'Europe/Rome', now = new Date();
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var end = new Date(start.getTime() + 21 * 86400000);

  var events = [];
  CalendarApp.getDefaultCalendar().getEvents(start, end).forEach(function (e) {
    if (e.getMyStatus() === CalendarApp.GuestStatus.NO) return;
    var allDay = e.isAllDayEvent();
    var date = Utilities.formatDate(e.getStartTime(), tz, 'yyyy-MM-dd');
    var mins = allDay ? 0 : Math.round((e.getEndTime() - e.getStartTime()) / 60000);
    events.push({
      id: e.getId(), title: e.getTitle(), date: date,
      time: allDay ? '' : Utilities.formatDate(e.getStartTime(), tz, 'HH:mm'),
      mins: mins, where: e.getLocation() || ''
    });
  });

  var me = Session.getActiveUser().getEmail().toLowerCase();
  var mails = [];
  GmailApp.search('in:inbox newer_than:7d -category:promotions -category:social -category:forums', 0, 40).forEach(function (t) {
    var ms = t.getMessages(), m = ms[ms.length - 1];
    if (m.getFrom().toLowerCase().indexOf(me) !== -1) return;
    mails.push({
      id: t.getId(), from: m.getFrom(), subject: m.getSubject(),
      date: Utilities.formatDate(m.getDate(), tz, 'yyyy-MM-dd HH:mm'),
      body: m.getPlainBody().replace(/\s+/g, ' ').slice(0, 1500)
    });
  });

  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-sync-secret': secret },
    payload: JSON.stringify({ today: Utilities.formatDate(now, tz, 'yyyy-MM-dd'), events: events, mails: mails })
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}

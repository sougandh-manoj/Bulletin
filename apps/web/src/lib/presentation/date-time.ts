export function formatDeliveryDateTime(value: string, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }).formatToParts(new Date(value));

    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value;
    const weekday = part("weekday");
    const day = part("day");
    const month = part("month");
    const year = part("year");
    const hour = part("hour");
    const minute = part("minute");
    const dayPeriod = part("dayPeriod");

    if (!weekday || !day || !month || !year || !hour || !minute || !dayPeriod) {
      return value;
    }

    return `${weekday}, ${day} ${month} ${year} at ${Number(hour)}:${minute} ${dayPeriod.toLocaleLowerCase("en-IN")}`;
  } catch {
    return value;
  }
}

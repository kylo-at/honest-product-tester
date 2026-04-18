export function formatTimestamp(timestamp: string) {
  return timestamp.replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

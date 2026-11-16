export const validDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
export const validTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
  validDate(value.slice(0, 10)) &&
  +value.slice(11, 13) <= 23 &&
  +value.slice(14, 16) <= 59 &&
  +value.slice(17, 19) <= 59 &&
  Number.isFinite(Date.parse(value));
export const validHttps = (value: unknown): value is string => {
  try {
    if (typeof value !== 'string') return false;
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};
// datetime-local is accepted for existing browser records; new form submissions store an offset.
export const validLocalDateTime = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) &&
  validDate(value.slice(0, 10)) &&
  +value.slice(11, 13) <= 23 &&
  +value.slice(14, 16) <= 59 &&
  +(value.slice(17, 19) || 0) <= 59 &&
  Number.isFinite(Date.parse(value));

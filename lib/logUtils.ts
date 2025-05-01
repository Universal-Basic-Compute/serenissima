const isProduction = process.env.NODE_ENV === 'production';

export const log = {
  debug: (...args: any[]) => {
    if (!isProduction) {
      console.debug(...args);
    }
  },
  info: (...args: any[]) => {
    if (!isProduction) {
      console.info(...args);
    }
  },
  warn: (...args: any[]) => {
    console.warn(...args);
  },
  error: (...args: any[]) => {
    console.error(...args);
  }
};

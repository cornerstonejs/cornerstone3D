export const attemptAction = async (
  action: () => Promise<void>,
  attempts = 10,
  delay = 100
) => {
  for (let i = 1; i < attempts; i++) {
    try {
      await action();
      return true;
    } catch (error) {
      if (i === attempts) {
        throw new Error('Action failed.');
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

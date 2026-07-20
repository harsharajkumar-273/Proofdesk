export const success = (message: string, data?: any) => ({
    status: "success",
    message,
    data,
});
export const failure = (message: string, error?: any) => ({
    status: "failure",
    message,
    error,
});

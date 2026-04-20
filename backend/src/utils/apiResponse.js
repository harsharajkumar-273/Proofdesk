export const success = (message, data) => ({
    status: "success",
    message,
    data,
});
export const failure = (message, error) => ({
    status: "failure",
    message,
    error,
});
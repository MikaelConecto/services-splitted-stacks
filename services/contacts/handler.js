export const creation = async event => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userPool: process.env.USER_POOL,
    }),
  }
}

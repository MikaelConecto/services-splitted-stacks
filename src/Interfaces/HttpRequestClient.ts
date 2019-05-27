interface HttpRequestClient {
  get: ({
    url,
    params,
    paramsSerializer,
  }: {
    url: string
    params?: any
    paramsSerializer?: any
  }) => Promise<any>
  post: ({ url, data }: { url: string; data?: any }) => Promise<any>
  put: ({ url, data }: { url: string; data?: any }) => Promise<any>
}

export default HttpRequestClient

import axios, { AxiosInstance, AxiosPromise, AxiosRequestConfig } from 'axios'

import HttpRequestClient from '../Interfaces/HttpRequestClient'

class AxiosClient implements HttpRequestClient {
  private engine: AxiosInstance

  constructor(requestConfig: AxiosRequestConfig = {}) {
    this.engine = axios.create(requestConfig)
  }

  get({
    url,
    params = {},
    paramsSerializer,
  }: {
    url: string
    params?: any
    paramsSerializer?: any
  }): AxiosPromise {
    return this.engine.get(url, { params, paramsSerializer })
  }

  post({ url, data = {} }: { url: string; data?: any }): AxiosPromise {
    return this.engine.post(url, { ...data })
  }

  put({ url, data = {} }: { url: string; data?: any }): AxiosPromise {
    return this.engine.put(url, { ...data })
  }
}

export default AxiosClient

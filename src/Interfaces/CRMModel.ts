import HttpRequestClient from './HttpRequestClient'

interface CRMModel {
  requestService: HttpRequestClient
  create?: (data: any) => Promise<any>
  fetch?: (id: number, params?: any) => Promise<any>
  addAssociatedContact?: (
    id: number,
    contact_id: number,
    role?: string
  ) => Promise<any>
  update: (id: number, data: any) => Promise<any>
  findAll?: (data: any) => Promise<any>
}

export default CRMModel

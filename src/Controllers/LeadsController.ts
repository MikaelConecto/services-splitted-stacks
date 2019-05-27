import HttpRequestClient from '../Interfaces/HttpRequestClient'
import YupValidator from '../Interfaces/YupValidator'
import DataTransformer from '../Interfaces/DataTransformer'
import CRMModel from '../Interfaces/CRMModel'

import LeadsModel from '../Models/LeadsModel'
import LeadCreationTransformedResponseData from '../Interfaces/LeadCreationTransformedResponseData'
import CRMErrorsHandler from '../Handlers/CRMErrorsHandler'

class LeadsController {
  private requestService: HttpRequestClient
  private validator: YupValidator
  private transformer: DataTransformer
  private model: CRMModel

  constructor(
    requestClient: HttpRequestClient,
    validator?: YupValidator,
    transformer?: DataTransformer
  ) {
    this.requestService = requestClient
    this.validator = validator
    this.transformer = transformer

    this.model = new LeadsModel(requestClient)
  }

  async create(data: any): Promise<LeadCreationTransformedResponseData> {
    try {
      const validData = await this.validator.validate(data, {
        abortEarly: false,
      })

      const transformedRawData = this.transformer.transformRawData(validData)

      const response = await this.model.create(transformedRawData)

      const transformedResponseData = this.transformer.transformResponseData(
        response
      )

      return transformedResponseData
    } catch (e) {
      console.log(e)
      throw new Error(e)
    }
  }

  async getInfoById(id: string): Promise<any> {
    try {
      const responseContact = await this.model.findAll({
        ids: id,
      })

      return responseContact
    } catch (e) {
      throw e
    }
  }

  async updateAllFromParams(params, data, condition) {
    try {
      const leadsId = []
      const updatePromises = []

      const allLeads = await this.model.findAll(params)

      if (
        typeof allLeads !== 'undefined' &&
        'data' in allLeads &&
        'items' in allLeads.data &&
        allLeads.data.items.length > 0
      ) {
        allLeads.data.items.forEach(lead => {
          condition(lead, data => {
            leadsId.push(data.data.id)
          })
        })
      }

      if (leadsId.length > 0) {
        leadsId.forEach(id => {
          updatePromises.push(this.model.update(id, data))
        })
      }

      return Promise.all(updatePromises)
        .then(
          () => `Leads ${leadsId.join(', ')} have been updated successfully`
        )
        .catch(() => 'Leads updates have failed')
    } catch (e) {
      throw new Error(e)
    }
  }
}

export default LeadsController

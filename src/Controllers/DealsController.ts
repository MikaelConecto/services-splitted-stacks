import HttpRequestClient from '../Interfaces/HttpRequestClient'
import YupValidator from '../Interfaces/YupValidator'
import DataTransformer from '../Interfaces/DataTransformer'
import CRMModel from '../Interfaces/CRMModel'

import DealsModel from '../Models/DealsModel'

class DealsController {
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

    this.model = new DealsModel(requestClient)
  }

  async getInfoById(id: number): Promise<any> {
    try {
      const responseContact = await this.model.fetch(id, {
        includes: 'associated_contacts',
      })

      return responseContact
    } catch (e) {
      throw new Error(e)
    }
  }

  async addAssociatedContact(
    id: number,
    contact_id: number,
    role?: string
  ): Promise<any> {
    try {
      const responseAssociatedContact = await this.model.addAssociatedContact(
        id,
        contact_id,
        role
      )

      return responseAssociatedContact
    } catch (e) {
      throw new Error(e)
    }
  }

  async update(id, data) {
    try {
      const responseDeal = await this.model.update(id, data)

      return responseDeal
    } catch (e) {
      throw new Error(e)
    }
  }

  async updateAllFromParams(params, data, condition) {
    try {
      const dealsId = []
      const updatePromises = []

      const allDeals = await this.model.findAll(params)

      if (
        typeof allDeals !== 'undefined' &&
        'data' in allDeals &&
        'items' in allDeals.data &&
        allDeals.data.items.length > 0
      ) {
        allDeals.data.items.forEach(lead => {
          condition(lead, data => {
            dealsId.push(data.data.id)
          })
        })
      }

      if (dealsId.length > 0) {
        dealsId.forEach(id => {
          updatePromises.push(this.model.update(id, data))
        })
      }

      return Promise.all(updatePromises)
        .then(
          () => `Deals ${dealsId.join(', ')} have been updated successfully`
        )
        .catch(() => 'Deals updates have failed')
    } catch (e) {
      throw new Error(e)
    }
  }
}

export default DealsController

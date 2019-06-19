import HttpRequestClient from '../Interfaces/HttpRequestClient'
import YupValidator from '../Interfaces/YupValidator'
import DataTransformer from '../Interfaces/DataTransformer'
import CRMModel from '../Interfaces/CRMModel'

import ContactsModel from '../Models/ContactsModel'
import logger from '../Helpers/logger'

class ContactsController {
  private requestService: HttpRequestClient
  private validator: YupValidator
  private transformer: DataTransformer
  private model: CRMModel

  constructor(
    requestClient: HttpRequestClient,
    transformer?: DataTransformer,
    validator?: YupValidator
  ) {
    this.requestService = requestClient
    this.transformer = transformer
    this.validator = validator

    this.model = new ContactsModel(requestClient)
  }

  async create(data: any): Promise<any> {
    try {
      logger(
        'Contractor Creation',
        'generic',
        'write',
        'validation',
        'Fields validation'
      )
      const validData = await this.validator.validate(data, {
        abortEarly: false,
      })

      logger(
        'Contractor Creation',
        'generic',
        'write',
        'transformation',
        'Fields transformation for Company Contact'
      )
      const transformedCieRawData = this.transformer.transformRawData(
        validData,
        {
          isCompany: true,
        }
      )

      logger(
        'Contractor Creation',
        'generic',
        'write',
        'request',
        'Before Company Contact Creation'
      )
      const responseCie = await this.model.create(transformedCieRawData)
      logger(
        'Contractor Creation',
        'generic',
        'write',
        'request',
        'After Company Contact Creation'
      )

      logger(
        'Contractor Creation',
        'generic',
        'write',
        'transformation',
        'Fields transformation for Person Contact'
      )
      const transformedContactRawData = this.transformer.transformRawData(
        validData,
        {
          isCompany: false,
          contactId: responseCie.data.data.id,
        }
      )

      logger(
        'Contractor Creation',
        'generic',
        'write',
        'request',
        'Before Person Contact Creation'
      )
      const responseContact = await this.model.create(transformedContactRawData)
      logger(
        'Contractor Creation',
        'generic',
        'write',
        'request',
        'After Person Contact Creation'
      )

      logger(
        'Contractor Creation',
        'generic',
        'write',
        'transformation',
        'Transform last contacts created'
      )
      const transformedResponseData = this.transformer.transformResponseData({
        company: responseCie,
        contact: responseContact,
      })

      return transformedResponseData
    } catch (e) {
      logger(
        'Contractor Creation',
        'generic',
        'write',
        'error',
        `ERROR: ${JSON.stringify(e)}`
      )
      throw new Error(e)
    }
  }

  async addUser(data: any): Promise<any> {
    try {
      logger(
        'Contractor Add User',
        'all',
        'write',
        'validation',
        `Fields validation for entry ${data.firstName} ${data.lastName}`
      )
      const validData = await this.validator.validate(data, {
        abortEarly: false,
      })

      logger(
        'Contractor Add User',
        'all',
        'write',
        'transformation',
        'Fields transformation for Company Contact'
      )

      const transformedContactRawData = this.transformer.transformRawData(
        validData
      )

      logger(
        'Contractor Add User',
        'all',
        'write',
        'request',
        'Before Company Add User'
      )
      const responseContact = await this.model.create(transformedContactRawData)

      logger(
        'Contractor Add User',
        'all',
        'write',
        'request',
        'Before Company Add User'
      )

      const transformedResponseData = this.transformer.transformResponseData(
        responseContact
      )

      logger(
        'Contractor Add User',
        'all',
        'write',
        'request',
        'After Company Add User'
      )

      return transformedResponseData
    } catch (e) {
      logger(
        'Contractor Add User',
        'all',
        'write',
        'error',
        `ERROR: ${JSON.stringify(e)}`
      )

      throw new Error(e)
    }
  }

  async getInfoById(id: number): Promise<any> {
    try {
      const responseContact = await this.model.fetch(id)

      return responseContact
    } catch (e) {
      throw new Error(e)
    }
  }

  async getContactAndOrganizationByIds(
    contactId: number,
    companyId: number
  ): Promise<any> {
    try {
      const contactFetch = this.model.fetch(contactId)
      const companyFetch = this.model.fetch(companyId)

      const responses = await Promise.all([contactFetch, companyFetch])

      const transformedResponseData = this.transformer.transformResponseData({
        contact: responses[0].data,
        organization: responses[1].data,
      })

      return transformedResponseData
    } catch (e) {
      throw new Error(e)
    }
  }

  async searchFor(params: any): Promise<any> {
    try {
      console.log('searchFor', params)
      const responseContact = await this.model.findAll(params)
      console.log('searchFor responseContact', responseContact.data.items)

      return responseContact
    } catch (e) {
      throw new Error(e)
    }
  }

  async update(id: number, data: any) {
    try {
      console.log('update request', id, data)
      const responseContact = await this.model.update(id, data)

      return responseContact
    } catch (e) {
      console.log('update error', e)
      throw new Error(e)
    }
  }

  async updateAllFromParams(params, data, condition) {
    try {
      const contactsId = []
      const updatePromises = []

      const allContacts = await this.model.findAll(params)

      if (
        'data' in allContacts &&
        'items' in allContacts.data &&
        allContacts.data.items.length > 0
      ) {
        allContacts.data.items.forEach(lead => {
          if (typeof condition === 'function') {
            condition(lead, data => {
              contactsId.push(data.data.id)
            })
          }
        })
      }

      if (contactsId.length > 0) {
        contactsId.forEach(id => {
          updatePromises.push(this.model.update(id, data))
        })
      }

      return Promise.all(updatePromises)
        .then(
          () =>
            `Contacts ${contactsId.join(', ')} have been updated successfully`
        )
        .catch(error => 'Contacts updates have failed')
    } catch (e) {
      throw new Error(e)
    }
  }
}

export default ContactsController

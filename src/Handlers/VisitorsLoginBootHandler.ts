import LeadsController from '../Controllers/LeadsController'
import ContactsController from '../Controllers/ContactsController'
import DealsController from '../Controllers/DealsController'
import HttpRequestClient from '../Interfaces/HttpRequestClient'

class VisitorsLoginBootHandler {
  Leads: any
  Contacts: any
  Deals: any
  contactsId: number[]

  constructor(crmClient: HttpRequestClient) {
    this.Leads = new LeadsController(crmClient)
    this.Contacts = new ContactsController(crmClient)
    this.Deals = new DealsController(crmClient)

    this.contactsId = []

    this.getContactsIds = this.getContactsIds.bind(this)
    this.checkForCognitoSub = this.checkForCognitoSub.bind(this)
  }

  getContactsIds(data, cb) {
    if (data.data.is_organization === false) {
      this.contactsId.push(data.data.id)

      if (!data.data.custom_fields.hasOwnProperty('cognitoSub')) {
        cb(data)
      }
    }
  }

  checkForCognitoSub(data, cb) {
    if (!data.data.custom_fields.hasOwnProperty('cognitoSub')) {
      cb(data)
    }
  }

  async handle(email: string, cognitoSub: string) {
    const searchParams = {
      email: email,
    }
    const updateData = {
      custom_fields: {
        cognitoSub: cognitoSub,
      },
    }

    const contactsUpdate = await this.Contacts.updateAllFromParams(
      searchParams,
      updateData,
      this.getContactsIds
    )

    const leadsUpdate = this.Leads.updateAllFromParams(
      searchParams,
      updateData,
      this.checkForCognitoSub
    )
    const dealsUpdate = []

    this.contactsId.forEach(contactId => {
      dealsUpdate.push(
        this.Deals.updateAllFromParams(
          {
            contact_id: contactId,
          },
          updateData,
          this.checkForCognitoSub
        )
      )
    })

    const allDealsUpdates = await Promise.all(dealsUpdate).then(
      result => result
    )

    return await Promise.all([leadsUpdate, allDealsUpdates, contactsUpdate])
  }
}

export default VisitorsLoginBootHandler

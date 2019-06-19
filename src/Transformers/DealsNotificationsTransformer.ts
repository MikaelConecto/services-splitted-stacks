import Cryptr from 'cryptr'
import _ from 'lodash'

import DataTransformer from '../Interfaces/DataTransformer'

const cryptr = new Cryptr(process.env.CRYPTR_SECRET_KEY)

class DealsNotificationsTransformer implements DataTransformer {
  transformResponseData(response: any, requestType: string): any {
    try {
    const opportunities = []
    const dealsById = {}

    if (response.deals !== null) {
      response.deals.Responses[process.env.DEALINFOS_TABLE].forEach(deal => {
        dealsById[deal.dealInfosId] = deal
      })
    }

    console.log('dealsById', dealsById)

    if (response.notifications.Items.length > 0) {
      _.uniqBy(response.notifications.Items, 'dealInfosId').forEach(notification => {
        console.log('DATA NOTIF', notification)
        const encryptedDealId = cryptr.encrypt(
          dealsById[notification.dealInfosId].dealId
        )
        const encryptedCompanyId = cryptr.encrypt(notification.companyId)
        const encryptedContactId = cryptr.encrypt(notification.contactId)
        const maxContacts = parseInt(process.env.MAX_ASSOCIATED_CONTACTS)
        let isAccepted = false
        let deal = {}

        for (let i = 1; i <= maxContacts; i++) {
          if (
            typeof dealsById[notification.dealInfosId][`seat${i}`] !==
              'undefined' &&
            dealsById[notification.dealInfosId][`seat${i}`] ===
              notification.companyId
          ) {
            isAccepted = true
          }
        }

        delete dealsById[notification.dealInfosId].id

        if (requestType === 'emitted') {
          if (
            dealsById[notification.dealInfosId].remainingSeats !==
            process.env.MAX_ASSOCIATED_CONTACTS
          ) {
            deal = {
              dealId: encryptedDealId,
              dealContactId: cryptr.encrypt(
                dealsById[notification.dealInfosId].dealContactId
              ),
              accepted: isAccepted,
              dealStatus: dealsById[notification.dealInfosId].dealStatus,
              preferredContactMethod:
                dealsById[notification.dealInfosId].preferredContactMethod,
              preferredContactTime:
                dealsById[notification.dealInfosId].preferredContactTime,
              remainingSeats:
                dealsById[notification.dealInfosId].remainingSeats,
              postal_code:
                dealsById[notification.dealInfosId].postal_code.substr(0, 3) +
                ' ***',
              city: dealsById[notification.dealInfosId].city,
              state: dealsById[notification.dealInfosId].state,
              jobType: dealsById[notification.dealInfosId].jobType,
              jobTypeSpecific:
                dealsById[notification.dealInfosId].jobTypeSpecific,
              latitude: dealsById[notification.dealInfosId].latitude,
              longitude: dealsById[notification.dealInfosId].longitude,
              companiesNotified:
                dealsById[notification.dealInfosId].companiesNotified,
              createdAt: dealsById[notification.dealInfosId].createdAt,
              updatedAt: dealsById[notification.dealInfosId].updatedAt,
            }

            opportunities.push({
              ...notification,
              companyId: encryptedCompanyId,
              contactId: encryptedContactId,
              dealId: encryptedDealId,
              deal: deal,
            })
          }
        } else if (requestType === 'leads') {
          deal = {
            ...dealsById[notification.dealInfosId],
            dealId: encryptedDealId,
            dealContactId: cryptr.encrypt(
              dealsById[notification.dealInfosId].dealContactId
            ),
          }
          const maxSeats = parseInt(process.env.MAX_ASSOCIATED_CONTACTS)

          for (let i = 1; i <= maxSeats; i++) {
            delete deal[`seat${i}`]
          }

          opportunities.push({
            ...notification,
            companyId: encryptedCompanyId,
            contactId: encryptedContactId,
            dealId: encryptedDealId,
            deal: deal,
          })
        }
      })
    }

    return opportunities.sort((a, b) => a.createdAt - b.createdAt).reverse()
    } catch (e) {
      console.log('transformer error', e)
      throw e
    }
  }
}

export default DealsNotificationsTransformer

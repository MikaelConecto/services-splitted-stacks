import Stripe from 'stripe'

import StripeContactInfos from '../Interfaces/StripeContactInfos'

class StripeClient {
  engine: any

  constructor() {
    this.engine = Stripe(process.env.STRIPE_SECRET_KEY)
  }

  createCustomer(contactInfos: StripeContactInfos): Promise<any> {
    return new Promise((resolve, reject) => {
      this.engine.customers.create(
        {
          email: contactInfos.email,
          source: contactInfos.source,
          description: `${contactInfos.zendeskCompanyId} - Conecto contractor`,
          shipping: {
            name: contactInfos.name,
            phone: contactInfos.phone,
            address: contactInfos.address,
          },
          metadata: {
            cognitoSub: contactInfos.cognitoSub,
            zendeskCompanyId: contactInfos.zendeskCompanyId,
            zendeskContactId: contactInfos.zendeskContactId,
          },
          preferred_locales: contactInfos.preferred_locales,
        },
        function(err, result) {
          if (err) {
            reject(err)
          } else {
            resolve(result)
          }
        }
      )
    })
  }

  linkSourceToCustomer(customerId: string, sourceId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.engine.customers.createSource(
        customerId,
        {
          source: sourceId,
        },
        function(err, result) {
          if (err) {
            reject(err)
          } else {
            resolve(result)
          }
        }
      )
    })
  }

  detachSourceFromCustomer(customerId: string, sourceId: string) {
    return new Promise((resolve, reject) => {
      this.engine.customers.deleteSource(customerId, sourceId, function(
        err,
        result
      ) {
        if (err) {
          reject(err)
        } else {
          resolve(result)
        }
      })
    })
  }

  fetchCustomer(customerId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.engine.customers.retrieve(customerId, function(err, result) {
        if (err) {
          reject(err)
        } else {
          resolve(result)
        }
      })
    })
  }

  updateCustomer(customerId: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.engine.customers.update(customerId, data, function(err, result) {
        if (err) {
          reject(err)
        } else {
          resolve(result)
        }
      })
    })
  }

  chargeAmount(
    customerId: string,
    amount: number,
    title: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.engine.charges.create(
        {
          amount: amount,
          currency: 'cad',
          customer: customerId, // obtained with Stripe.js
          description: title,
        },
        function(err, result) {
          if (err) {
            reject(err)
          } else {
            resolve(result)
          }
        }
      )
    })
  }

  listCharges(
    customerId: string,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.engine.charges.list(
        {
          customer: customerId, // obtained with Stripe.js
          limit: 100,
        },
        function(err, result) {
          if (err) {
            reject(err)
          } else {
            resolve(result)
          }
        }
      )
    })
  }
}

export default StripeClient

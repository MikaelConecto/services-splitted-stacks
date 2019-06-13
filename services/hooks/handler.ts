import { APIGatewayProxyHandler } from 'aws-lambda'
import Cryptr from 'cryptr'
import nanoidGenerate from 'nanoid/generate'

import TwilioClient from '../../src/Clients/TwilioClient'
import MandrillClient from '../../src/Clients/MandrillClient'
import AxiosClient from '../../src/Clients/AxiosClient'
import DynamoDBClient from '../../src/Clients/DynamoDBClient'
import CognitoServiceProviderClient from '../../src/Clients/CognitoServiceProviderClient'

import ContactsController from '../../src/Controllers/ContactsController'
import DealsController from '../../src/Controllers/DealsController'
import ShortCmController from '../../src/Controllers/ShortCmController'

import PhoneNumberTransformer from '../../src/Transformers/PhoneNumberTransformer'
import BodyParserTransformer from '../../src/Transformers/BodyParserTransformer'

import ResponseFactory from '../../src/Factories/ResponseFactory'
import ErrorFactory from '../../src/Factories/ErrorFactory'

const cryptr = new Cryptr(process.env.CRYPTR_SECRET_KEY)

const dynamoDb = new DynamoDBClient()
const twilioClient = new TwilioClient()
const mandrillClient = new MandrillClient()
const phoneTransformer = new PhoneNumberTransformer()

import logger from '../../src/Helpers/logger'
import labelsJobType from '../../src/Helpers/labelsJobType'

import downloadFromUrlToS3 from '../../src/Helpers/downloadFromUrlToS3'
import mapStyle from '../../src/Helpers/mapStyle'
import staticMapStyleGenerator from '../../src/Helpers/staticMapStyleGenerator'


const cognitoIdentityClient = new CognitoServiceProviderClient()

export const onNewDeal: APIGatewayProxyHandler = async event => {
  logger('Hook On New Deal', 'generic', 'begin')
  try {
    // From Zapier
    const parsedData = new BodyParserTransformer().transform(event.body)
    const { contactId, dealId } = parsedData

    const crmClient = new AxiosClient({
      baseURL: process.env.ZENDESK_API_V2_URL,
      timeout: 3000,
      headers: {
        Authorization: `Bearer ${process.env.ZENDESK_API_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
    console.log(process.env.SHORT_CM_URL, process.env.SHORT_CM_KEY)
    const shortCmClient = new AxiosClient({
      baseURL: process.env.SHORT_CM_URL,
      timeout: 3000,
      headers: {
        Authorization: process.env.SHORT_CM_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })

    const Contacts = new ContactsController(crmClient)
    const Deals = new DealsController(crmClient)
    const ShortCm = new ShortCmController(shortCmClient)

    logger(
      'Hook On New Deal',
      'generic',
      'read',
      'request',
      `Fetch Deal Contact Infos - ContactId: ${contactId}`
    )

    const dealContactQuery = Contacts.getInfoById(contactId)

    logger(
      'Hook On New Deal',
      'generic',
      'read',
      'request',
      `Fetch Deal Infos - DealId: ${contactId}`
    )

    const dealQuery = Deals.getInfoById(dealId)

    const encryptedDealId = cryptr.encrypt(dealId)

    const opportunityInfos = await Promise.all([dealContactQuery, dealQuery])
    const dealContactInfo = opportunityInfos[0].data.data
    const dealInfo = opportunityInfos[1].data.data

    /**
     * START FAKE ALGO POUR TROUVER DES CONTRACTEURS
     */
    logger(
      'Hook On New Deal',
      'generic',
      'read',
      'request',
      `Search All Companies In Zendesk`
    )

    const companiesQuery = await Contacts.searchFor({
      is_organization: true,
      custom_fields: {
        verified: 1,
      }
    })

    const companies = companiesQuery.data.items

    const dealExists = await dynamoDb.scan({
      TableName: process.env.DEALINFOS_TABLE,
      FilterExpression: '#dealId = :dealId AND #dealContactId = :dealContactId',
      ExpressionAttributeNames: {
        '#dealId': 'dealId',
        '#dealContactId': 'dealContactId',
      },
      ExpressionAttributeValues: {
        ':dealId': dealInfo.id,
        ':dealContactId': dealContactInfo.id,
      },
    })
    let dealInfosUUID = null

    if (dealExists.Count === 0) {
      dealInfosUUID = `${process.env.SERVICE_UUID_PREFIX}-${nanoidGenerate(
        '1234567890abcdefghijklmnopqrstuvwxyz',
        10
      )}`
      dealInfosUUID = dealInfosUUID.toUpperCase()
      const dealInfosDateNow = Date.now()

      logger(
        'Hook On New Deal',
        'generic',
        'write',
        'generation',
        `Generate Deal UUID ${dealInfosUUID}`
      )

      var mapCenter =
        dealInfo.custom_fields.latitude + ',' + dealInfo.custom_fields.longitude
      var mapUrl =
        'http://maps.googleapis.com/maps/api/staticmap?' +
        'center=' +
        mapCenter +
        '&' +
        'size=700x250&' +
        'sensor=false&' +
        'zoom=11&' +
        'maptype=' +
        staticMapStyleGenerator(mapStyle) +
        '&' +
        'markers=color:0x35b78e|' +
        mapCenter +
        '&' +
        'key=' + process.env.GOOGLE_MAP_API_KEY

      downloadFromUrlToS3(mapUrl, `${dealInfosUUID}.png`).then(result => {
        logger(
          'Hook On New Deal',
          'generic',
          'write',
          'download',
          `Download Static Map ${dealInfosUUID}.png`
        )
        console.log('BUCKET UPLOAD', result)
      })

      logger(
        'Hook On New Deal',
        'generic',
        'write',
        'request',
        `Entry for New Deal - DealId: ${
          dealInfo.id
          }, DealInfosId ${dealInfosUUID}`
      )

      await dynamoDb.put({
        TableName: process.env.DEALINFOS_TABLE,
        Item: {
          dealId: dealInfo.id,
          dealInfosId: dealInfosUUID,
          dealContactId: dealContactInfo.id,
          dealStatus: 'Notified',
          email: dealContactInfo.email,
          firstName: dealContactInfo.first_name,
          lastName: dealContactInfo.last_name,
          phone: phoneTransformer.transform(dealContactInfo.phone),
          address: dealContactInfo.address.line1,
          postal_code: dealContactInfo.address.postal_code,
          city: dealContactInfo.address.city,
          state: dealContactInfo.address.state,
          country: dealContactInfo.address.country,
          jobType: dealInfo.custom_fields.jobType,
          jobTypeSpecific: dealInfo.custom_fields.jobTypeSpecific,
          preferredContactMethod: dealInfo.custom_fields.preferredContactMethod,
          preferredContactTime: dealInfo.custom_fields.preferredContactTime,
          remainingSeats: parseInt(process.env.MAX_ASSOCIATED_CONTACTS),
          companiesNotified: companies.length,
          latitude: dealInfo.custom_fields.latitude,
          longitude: dealInfo.custom_fields.longitude,
          createdAt: dealInfosDateNow,
          updatedAt: dealInfosDateNow,
        },
      })

      await Deals.update(dealInfo.id, {
        custom_fields: {
          uniqueId: dealInfosUUID,
        },
      })
    } else {
      dealInfosUUID = dealExists.Items[0].dealInfosId
    }

    logger('Hook On New Deal', 'generic', 'process', 'forEach', 'Companies')

    const companyPromises = []

    companies.forEach(company => {
      const companyId = company.data.id
      const encryptedCompanyId = cryptr.encrypt(companyId)

      const companyPromise = new Promise(async (resolve, reject) => {
        logger(
          'Hook On New Deal',
          'generic',
          'read',
          'request',
          `Search for Company Contact - ContactId ${companyId}, CompanyId ${companyId}`
        )

        const companyContactsQuery = await Contacts.searchFor({
          contact_id: companyId,
          is_organization: false,
        })

        const contactPromises = []

        if (companyContactsQuery.data.items.length > 0) {
          let urlTo = ''
          let templateName = ''
          if (company.data.custom_fields.locale === 'fr') {
            urlTo = process.env.CORS_ORIGIN_1
            templateName = process.env.MANDRILL_TEMPLATE_FR_NAME
          } else {
            urlTo = process.env.CORS_ORIGIN_2
            templateName = process.env.MANDRILL_TEMPLATE_EN_NAME
          }

          logger(
            'Hook On New Deal',
            'generic',
            'write',
            'request',
            `Short.cm SMS Link Creation`
          )
          const shortCmLinkSms = ShortCm.create({
            originalURL: `${urlTo}${
              process.env.ACCEPTANCE_PAGE_URL
              }?d=${encryptedDealId}&c=${encryptedCompanyId}&t=sms`,
            domain: 'opp.conecto.ca',
            tags: ['sms', process.env.NODE_ENV, companyId, dealInfosUUID],
            utmSource: process.env.NODE_ENV,
            utmMedium: 'email',
            utmCampaign: 'notif-sys',
            utmContent: `opp-${dealInfosUUID}`,
          })
          logger(
            'Hook On New Deal',
            'generic',
            'write',
            'request',
            `Bit.ly EMAIL Link Creation`
          )
          const shortCmLinkEmail = ShortCm.create({
            originalURL: `${urlTo}${
              process.env.ACCEPTANCE_PAGE_URL
              }?d=${encryptedDealId}&c=${encryptedCompanyId}&t=email`,
            domain: 'opp.conecto.ca',
            tags: ['email', process.env.NODE_ENV, companyId, dealInfosUUID],
            utmSource: process.env.NODE_ENV,
            utmMedium: 'email',
            utmCampaign: 'notif-sys',
            utmContent: `opp-${dealInfosUUID}`,
          })

          const ShortCmPromises = await Promise.all([
            shortCmLinkSms,
            shortCmLinkEmail,
          ]).catch(e => {
            reject(e)
          })

          logger(
            'Hook On New Deal',
            'generic',
            'write',
            'generate',
            `SMS notification strings`
          )

          console.log('company.data', company.data);
          console.log('company.data.custom_fields.locale', company.data.custom_fields.locale);

          const SMSNotification = {
            fr: `* Message de Conecto * Nouvelle opportunité *\n\n${dealInfosUUID}\nVille de ${dealContactInfo.address.city} (${dealContactInfo.address.postal_code.substr(
              0,
              3
            )}***)\nPente: ${labelsJobType[company.data.custom_fields.locale][`labelJobTypeSpecific_${dealInfo.custom_fields.jobTypeSpecific}`]}\nType: ${labelsJobType[company.data.custom_fields.locale][`labelJobType_${dealInfo.custom_fields.jobType}`]}\n\nAller sur la plateforme\n${ShortCmPromises[0].data.secureShortURL}`,
            en: `* Message from Conecto * New opportunity *\n\n${dealInfosUUID}\n${dealContactInfo.address.city} (${dealContactInfo.address.postal_code.substr(
              0,
              3
            )}***)\nSlope: ${labelsJobType[company.data.custom_fields.locale][`labelJobTypeSpecific_${dealInfo.custom_fields.jobTypeSpecific}`]}\nType: ${labelsJobType[company.data.custom_fields.locale][`labelJobType_${dealInfo.custom_fields.jobType}`]}\n\nGo on the platform:\n${ShortCmPromises[0].data.secureShortURL}`,
          }

          logger(
            'Hook On New Deal',
            'generic',
            'process',
            'forEach',
            `Company Contacts`
          )
          companyContactsQuery.data.items.forEach(async companyContact => {
            const companyContactInfos = companyContact.data
            let contactPromise = null

            const contactCognito = await cognitoIdentityClient.getUser({
              userPoolId: process.env.USER_POOL,
              cognitoSub: companyContactInfos.custom_fields.cognitoSub,
            })

            console.log(contactCognito)

            if (companyContactInfos.custom_fields.activeForRoofing) {
              contactPromise = new Promise(async (resolve, reject) => {
                try {
                  const dateNow = Date.now()

                  const hasNotifications = await dynamoDb.query({
                    TableName: process.env.NOTIFICATIONS_TABLE,
                    KeyConditionExpression: '#id = :id',
                    ExpressionAttributeNames: {
                      '#id': 'id',
                    },
                    ExpressionAttributeValues: {
                      ':id': `${companyId}_${companyContactInfos.id}_${
                        dealInfo.id
                        }`,
                    },
                  })

                  if (hasNotifications.Count === 0) {
                    const promises = []

                    logger(
                      'Hook On New Deal',
                      'generic',
                      'write',
                      'request',
                      `Notifications Entry - ContactId: ${
                        companyContactInfos.id
                        }, CompanyId: ${companyId}`
                    )
                    const notificationRequest = dynamoDb.put({
                      TableName: process.env.NOTIFICATIONS_TABLE,
                      Item: {
                        id: `${companyId}_${companyContactInfos.id}_${
                          dealInfo.id
                          }`,
                        dealId: dealInfo.id,
                        dealInfosId: dealInfosUUID,
                        contactId: companyContactInfos.id,
                        companyId: companyId,
                        answer: 'Unanswered',
                        answerType: 'null',
                        answeredBy: 'null',
                        transactionId: 'null',
                        firstContact: 0,
                        firstContactMethod: 'null',
                        firstContactInfo: 'null',
                        firstContactDate: 0,
                        answeredAt: 0,
                        createdAt: dateNow,
                        updatedAt: dateNow,
                      },
                    })
                    promises.push(notificationRequest)

                    logger(
                      'Hook On New Deal',
                      'generic',
                      'write',
                      'request',
                      `Twilio SMS - ContactPhone: ${companyContactInfos.phone}`
                    )

                    console.log('contactCognito', contactCognito)

                    if (contactCognito.phone_number_verified === 'true') {
                      const sms = twilioClient.sendSMS(
                        phoneTransformer.transform(companyContactInfos.phone), SMSNotification[company.data.custom_fields.locale]
                      )
                      promises.push(sms)
                    }

                    logger(
                      'Hook On New Deal',
                      'generic',
                      'write',
                      'request',
                      `Mandrill Email - ContactEmail: ${
                        companyContactInfos.email
                        }`
                    )

                    const mailData = {
                      to: companyContactInfos.email,
                      name: `${companyContactInfos.first_name} ${
                        companyContactInfos.last_name
                        }`,
                      subject: (company.data.custom_fields.locale === 'fr') ? `Conecto - Nouvelle opportunité dans la ville de ${dealContactInfo.address.city} (${dealContactInfo.address.postal_code.substr(
                        0,
                        3
                      )}***)` : `Conecto - New opportunity in ${dealContactInfo.address.city} (${dealContactInfo.address.postal_code.substr(
                        0,
                        3
                      )}***)`,
                      templateName: templateName,
                      templateContent: [
                        {
                          name: 'opportunityid',
                          content: dealInfosUUID,
                        },{
                          name: 'opportunitycity',
                          content: `${dealContactInfo.address.city}, ${dealContactInfo.address.state}`,
                        },{
                          name: 'opportunityjob',
                          content: labelsJobType[company.data.custom_fields.locale][`labelJobType_${dealInfo.custom_fields.jobType}`],
                        },{
                          name: 'opportunityjobspecific',
                          content: labelsJobType[company.data.custom_fields.locale][`labelJobTypeSpecific_${dealInfo.custom_fields.jobTypeSpecific}`],
                        }
                      ],
                      async: true,
                    }
                    const email = mandrillClient.sendEmailWithTemplate(mailData, {
                      global_merge_vars: [
                        {
                          name: "acceptance_url",
                          content: ShortCmPromises[1].data.secureShortURL
                        }
                      ],
                    })
                    promises.push(email)

                    resolve(Promise.all(promises))
                  } else {
                    resolve()
                  }
                } catch (e) {
                  logger(
                    'Hook On New Deal',
                    'generic',
                    'end',
                    'error',
                    JSON.stringify(e, null, 2)
                  )
                  reject(e)
                }
              })
            }

            contactPromises.push(contactPromise)
          })
        }

        Promise.all(contactPromises)
          .then(results => {
            resolve(results)
          })
          .catch(error => {
            logger(
              'Hook On New Deal',
              'generic',
              'end',
              'error',
              JSON.stringify(error, null, 2)
            )
            reject(error)
          })
      })

      companyPromises.push(companyPromise)
    })

    await Promise.all(companyPromises)

    logger('Hook On New Deal', 'generic', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          message: 'notified',
        },
      },
      '*'
    )
  } catch (err) {
    logger('Hook On New Deal', 'generic', 'end', 'error')
    return new ErrorFactory().build(err, '*')
  }
}

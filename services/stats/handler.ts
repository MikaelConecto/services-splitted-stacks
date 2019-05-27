import { APIGatewayProxyHandler } from 'aws-lambda'
import moment from 'moment'

import DynamoDBClient from '../../src/Clients/DynamoDBClient'

import ResponseFactory from '../../src/Factories/ResponseFactory'
import ErrorFactory from '../../src/Factories/ErrorFactory'
import CognitoServiceProviderClient from "../../src/Clients/CognitoServiceProviderClient";

const dynamoDb = new DynamoDBClient()
const cognitoIdentityClient = new CognitoServiceProviderClient()

export const generateCompanyStats: APIGatewayProxyHandler = async event => {
  try {
    const companiesWithScores = await dynamoDb.scan({
      TableName: process.env.COMPANYSCORE_TABLE,
      ProjectionExpression: 'companyId, isActive',
    })
    const activeCompanies = companiesWithScores.Items.filter(
      company => company.isActive === 1
    ).map(company => company.companyId)
    const activePromises = []

    const getTimePart = time => {
      if (time >= 8 && time < 12) {
        return 'am'
      } else if (time >= 12 && time < 18) {
        return 'pm'
      } else if (time >= 18 && time < 22) {
        return 'evening'
      }
    }

    activeCompanies.forEach(activeCompanyId => {
      const companyPromise = new Promise(async (resolve, reject) => {
        try {
          const companyNotifications = await dynamoDb.scan({
            TableName: process.env.NOTIFICATIONS_TABLE,
            ProjectionExpression:
              '#companyId, answer, dealId, dealInfosId, firstContactDate, answeredAt, createdAt',
            FilterExpression: '#companyId = :companyId AND #createdAt BETWEEN :startMonth AND :endMonth',
            ExpressionAttributeNames: {
              '#companyId': 'companyId',
              '#createdAt': 'createdAt',
            },
            ExpressionAttributeValues: {
              ':companyId': activeCompanyId,
              ':startMonth': parseInt(moment().date(1).hours(0).minutes(0).seconds(0).milliseconds(0).format('x')),
              ':endMonth': parseInt(moment().endOf('month').format('x')),
            },
          })
          const existingDealIds = []
          const groupedNotifications = {}

          companyNotifications.Items.forEach(companyNotification => {
            if (
              existingDealIds.indexOf(companyNotification.dealId) === -1 ||
              (existingDealIds.indexOf(companyNotification.dealId) === -1 &&
                companyNotification.answer === 'Accepted')
            ) {
              existingDealIds.push(companyNotification.dealId)

              groupedNotifications[
                companyNotification.dealId
                ] = companyNotification
            }
          })

          const notifCount = companyNotifications.Count
          const unansweredNotifications = companyNotifications.Items.filter(
            item => item.answer.indexOf('Unanswered') >= 0
          )

          const acceptedNotifications = companyNotifications.Items.filter(
            item => item.answer.indexOf('Accepted') >= 0
          )
          const acceptationDelays = acceptedNotifications.map(
            accepted => accepted.answeredAt - accepted.createdAt
          )

          let acceptedDeals = {}
          let unansweredDeals = {}

          const unansweredKeys = unansweredNotifications.map(notification => ({
            dealId: notification.dealId,
            dealInfosId: notification.dealInfosId,
          }))
          const dealsKeys = acceptedNotifications.map(notification => ({
            dealId: notification.dealId,
            dealInfosId: notification.dealInfosId,
          }))

          if (dealsKeys.length !== 0) {
            const requestItemsObj = {
              RequestItems: {},
            }
            requestItemsObj.RequestItems[process.env.DEALINFOS_TABLE] = {
              Keys: dealsKeys,
              ProjectionExpression:
                'dealId, dealInfosId, preferredContactMethod, preferredContactTime, remainingSeats',
            }

            const acceptedDealsRequest = await dynamoDb.batchGet(requestItemsObj)

            acceptedDealsRequest.Responses[process.env.DEALINFOS_TABLE].forEach(
              acceptedDeal => {
                acceptedDeals[acceptedDeal.dealId] = acceptedDeal
              }
            )
          }

          if (unansweredKeys.length !== 0) {
            const requestItemsObj = {
              RequestItems: {},
            }
            requestItemsObj.RequestItems[process.env.DEALINFOS_TABLE] = {
              Keys: unansweredKeys,
              ProjectionExpression:
                'dealId, dealInfosId, remainingSeats',
            }

            const unansweredDealsRequest = await dynamoDb.batchGet(requestItemsObj)

            unansweredDealsRequest.Responses[process.env.DEALINFOS_TABLE].forEach(
              unansweredDeal => {
                unansweredDeals[unansweredDeal.dealId] = unansweredDeal
              }
            )
          }

          const firstContactDelays = []

          acceptedNotifications.forEach(acceptedNotification => {
            if (acceptedNotification.firstContactDate !== 0) {
              const currentDeal = acceptedDeals[acceptedNotification.dealId]
              const contactTime = currentDeal.preferredContactTime.split(', ')
              const createdDate = moment(acceptedNotification.createdAt)
              const createdDayPart = getTimePart(createdDate.format('H'))
              let startTime: any = 0

              if (contactTime.indexOf(createdDayPart) >= 0) {
                startTime = moment(acceptedNotification.createdAt)
              } else {
                if (createdDayPart === 'am') {
                  if (contactTime.indexOf('pm') >= 0) {
                    startTime = createdDate
                      .hours(12)
                      .minutes(0)
                      .seconds(0)
                      .milliseconds(0)
                  } else if (contactTime.indexOf('evening') >= 0) {
                    startTime = createdDate
                      .hours(18)
                      .minutes(0)
                      .seconds(0)
                      .milliseconds(0)
                  }
                } else if (createdDayPart === 'pm') {
                  if (contactTime.indexOf('am') >= 0) {
                    startTime = createdDate
                      .add(1, 'days')
                      .hours(8)
                      .minutes(0)
                      .seconds(0)
                      .milliseconds(0)
                  } else if (contactTime.indexOf('evening') >= 0) {
                    startTime = createdDate
                      .hours(18)
                      .minutes(0)
                      .seconds(0)
                      .milliseconds(0)
                  }
                } else if (createdDayPart === 'evening') {
                  if (contactTime.indexOf('am') >= 0) {
                    startTime = createdDate
                      .add(1, 'days')
                      .hours(8)
                      .minutes(0)
                      .seconds(0)
                      .milliseconds(0)
                  } else if (contactTime.indexOf('pm') >= 0) {
                    startTime = createdDate
                      .add(1, 'days')
                      .hours(12)
                      .minutes(0)
                      .seconds(0)
                      .milliseconds(0)
                  }
                }
              }

              const contactDelay =
                acceptedNotification.firstContactDate - startTime.format('x')

              if (contactDelay > 0) {
                firstContactDelays.push(contactDelay)
              }
            }
          })

          let addedFirstContactDelays = 0
          let addedAcceptationDelays = 0

          firstContactDelays.forEach(delay => {
            addedFirstContactDelays += delay
          })
          acceptationDelays.forEach(delay => {
            addedAcceptationDelays += delay
          })

          const firstContactAverage =
            addedFirstContactDelays / firstContactDelays.length || 0
          const acceptationDelayAverage =
            addedAcceptationDelays / acceptationDelays.length || 0
          const groupedNotificationsCount = Object.keys(groupedNotifications).length
          let percentAcceptation = 0

          if (acceptedNotifications.length > 0 && groupedNotificationsCount > 0) {
            percentAcceptation = (acceptedNotifications.length / groupedNotificationsCount) * 100
          }

          const dateNow = Date.now()

          const statQuery = dynamoDb.put({
            TableName: process.env.COMPANY_STATS_TABLE,
            Item: {
              companyId: parseInt(activeCompanyId),
              timestamp: dateNow,
              firstContactAverage: firstContactAverage,
              acceptationDelayAverage: acceptationDelayAverage,
              opportunitiesCount: notifCount,
              competitorCount: activeCompanies.length - 1,
              percentAcceptation: percentAcceptation,
            },
          })

          resolve(statQuery)
        } catch (e) {
          reject(e)
        }
      })

      activePromises.push(companyPromise)
    })

    const notifications = await Promise.all(activePromises)

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          success: true,
        },
      },
      '*'
    )
  } catch (err) {
    return new ErrorFactory().build(err, '*')
  }
}

export const getCompanyStats: APIGatewayProxyHandler = async event => {
  try {
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    if (connectedUser['custom:isActive'] === '0') {
      throw 'The user is not active'
    }

    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])

    const stats = await dynamoDb.query({
      TableName: process.env.COMPANY_STATS_TABLE,
      KeyConditionExpression: '#companyId = :companyId',
      ExpressionAttributeNames: {
        '#companyId': 'companyId',
      },
      ExpressionAttributeValues: {
        ':companyId': connectedCompanyId,
      },
    })
    let sortedStats

    if (stats.Items.length > 0) {
      sortedStats = stats.Items.sort((a, b) => a.timestamp - b.timestamp).reverse()[0]
      delete sortedStats.companyId
    } else {
      sortedStats = {
        companyId: connectedCompanyId,
        timestamp: Date.now(),
        firstContactAverage: 0,
        acceptationDelayAverage: 0,
        opportunitiesCount: 0,
        competitorCount: 0,
        percentAcceptation: 0,
      }
    }

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          ...sortedStats,
        },
      },
      '*'
    )
  } catch (err) {
    return new ErrorFactory().build(err, '*')
  }
}

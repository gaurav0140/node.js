const express = require('express')
const path = require('path')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is Running at http://localhost:3000')
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}
initializeDbAndServer()

const getFollowingPeopleIdsOfUser = async username => {
  const getTheFollowingPeopleQuery = `
  SELECT
    following_user_id FROM follower INNER JOIN user ON user.user_id = follower.follwer_user_id
    WHERE user.username='${username}';`
  const followingPeople = await db.all(getTheFollowingPeopleQuery)
  const arrayOfIds = followingPeople.map(eachUser => eachUser.following_user_id)
  return arrayOfIds
}
// AUTHENTICATION TOKEN
const authentication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken) {
    jwt.verify(jwtToken, 'SECRET_KEY', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.userName = payload.username
        request.userId = payload.userId
        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}
// TWEET ACCESS VERIFICATION
const tweetAccessVerification = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetQuery = `
    SELECT 
      *
    FROM
      tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
    WHERE
      tweet.tweet_id ='${tweetId}' AND follower_user_id = '${userId}';`
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    responsse.send('Invalid Request')
  } else {
    next()
  }
}
//Register User API 1

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const userDBDetails = await db.get(getUserQuery)

  if (userDBDetails !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `INSERT INTO user(username, password, name, gender) VALUES('${username}', '${hashedPassword}', '${name}', '${gender}')`
      await db.run(createUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  }
})

//User Login API - 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    const isPasswordCorrect = await bcrypt.compare(password, dbUser.password)
    if (isPasswordCorrect) {
      const payload = {username, userId: dbUser.user_id}
      const jwtToken = jwt.sign(payload, 'SECRET_KEY')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid User')
  }
})
//User Tweets Feed API - 3
app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {username} = request
  const getFollowingPeopleIds = await getFollowingPeopleIdsOfUser(username)
  const getTweetsFeedQuery = `
    SELECT
        username,
        tweet,
        date_time as dateTime
    FROM
       user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE
        user.user_id IN (${followingPeopleIds})
    ORDER BY 
          date_time DESC
    LIMIT 4;`
  const tweetFeedArray = await db.all(getTweetsFeedQuery)
  response.send(tweetFeedArray)
})

//Get User Following User Names API - 4
app.get('/user/following', authentication, async (request, response) => {
  const {username, userId} = request
  const userFollowsQuery = `
          SELECT
              name
          FROM
            follower INNER JOIN user ON user.user_id = follower.following_user_id
          WHERE
              following_user_id='${userId}';`
  const userFollowsArray = await db.all(userFollowsQuery)
  response.send(userFollowsArray)
})

//Get User Names Followers API-5
app.get('/user/followers', authentication, async (request, response) => {
  const {username, userId} = request
  const getFollowersQuery = `
        SELECT
            DISTINCT name
        FROM 
            follower INNER JOIN user ON user.user_id = follower.follower_user_id
        WHERE
            following_user_id='${userId}';`
  const followers = await db.all(getFollowersQuery)
  response.send(followers)
})
//Get Tweet API - 6
app.get('/tweets/:tweetId', authentication, async (request, response) => {
  const {username, userId} = request
  const {tweetId} = request.params
  const getTweetsQuery = `SELECT tweet,
    (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
    date_time AS dateTime FROM tweet WHERE tweet.tweet_id = '${tweetId}';`
  const tweetsResult = await db.get(getTweetsQuery)
  response.send(tweetsResult)
})
//API - 7
app.get('/tweets/:tweetId/likes', authentication, async (request, response) => {
  const {tweetId} = request.params
  const getLikedUserQuery = `
              SELECT
                  username 
              FROM
                  user INNER JOIN like ON user.user_id = like.user_id
              WHERE
                  tweet_id = '${tweetId}';`
  const likedUsers = await db.all(getLikedUserQuery)
  const userArray = likedUsers.map(eachUser => eachUser.username)
  response.send({likes: userArray})
})
//API-8
app.get(
  '/tweeets/:tweetId/replies',
  authentication,
  async (request, response) => {
    const {tweetId} = request.params
    const getRepliedUsersQuery = `
              SELECT
                name, reply
              FROM user INNER JOIN reply ON user.user_id = reply.user_id
              WHERE tweet_id = '${tweetId}';`
    const repliedUsers = await db.all(getRepliedUsersQuery)
    response.send({replies: repliedUsers})
  },
)
// API - 9
app.get('/user/tweets', authentication, async (request, response) => {
  const {userId} = request.params
  const getTweetsDetailsQuery = `
          SELECT
              tweet.tweet AS tweet,
              COUNT(DISTINCT like.like_id) AS likes,
              COUNT(DISTINCT reply.reply_id) AS replies,
              date_time AS dateTime 
          FROM  tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id LEFT JOIN like ON tweet.tweet_id = reply.tweet_id LEFT JOIN like ON tweet.tweet_id = like.tweet_id
          WHERE tweet.user_id = ${userId}
          GROUP BY tweet.tweet_id;`
  const tweetsDetails = await db.all(getTweetsDetailsQuery)
  response.send(tweetsDetails)
})
// API - 10
app.post('/user/tweets', authentication, async (request, response) => {
  const {tweet} = request.body
  const userId = parseINT(request.user_id)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const postTweetQuery = `INSERT INTO tweet(tweet, user_id, date_time) VALUES('${tweet}', '${userId}', '${dateTime}')`
  await db.run(postTweetQuery)
  response.send('Created a Tweet')
})

// API - 11
app.delete('/tweets/:tweetId', authentication, async (request, response) => {
  const {tweetId} = request
  const selectUsersQuery = `SELECT * FROM tweet WHERE user_id = '${userId}' AND tweet_id = '${tweetId}';`
  const tweetUser = await db.get(selectUsersQuery)
  console.log(tweetUser)
  if (tweetUser === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE
            tweet_id=${tweetId};`
    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  }
})
module.exports = app

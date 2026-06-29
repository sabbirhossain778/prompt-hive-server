const express = require('express');
const cors = require('cors');
const app = express()
const port = 5000;
require('dotenv').config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.get('/', (req, res) => {
  res.send('Hello World!')
})


const logger = (req, res, next) => {
  console.log('logger middleware logged', req.params);
  next();
}


const uri = process.env.MONGO_DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db('promt-hive-db');
    const promptCollection = database.collection('prompts');
    const bookmarkCollection = database.collection('bookmarks');
    const reportCollection = database.collection('reports');
    const reviewCollection = database.collection('reviews');
    const planCollection = database.collection('plans');
    const subscriptionCollection = database.collection('subscriptions');
    const userCollection = database.collection('user');
    const sessionCollection = database.collection('session');


    // verification related
    // const verifyToken = async (req, res, next) => {

    //   const authHeader = req.headers?.authorization;
    //   if (!authHeader) {
    //     return res.status(401).send({ message: 'unauthorized access' })
    //   }

    //   const token = authHeader.split(' ')[1]
    //   if (!token) {
    //     return res.status(401).send({ message: 'unauthorized access' })
    //   }

    //   const query = { token: token }
    //   const session = await sessionCollection.findOne(query);
    //   console.log(session);

    //   if (!session) {
    //     return res.status(401).send({ message: 'unauthorized access' })
    //   }

    //   const userId = session.userId;
    //   const userQuery = {
    //     _id: userId
    //   }

    //   const user = await userCollection.findOne(userQuery);
    //   if (!user) {
    //     return res.status(401).send({ message: 'unauthorized access' })
    //   }

    //   // set data in the req object
    //   req.user = user;
    //   next();
    // }
    const verifyToken = async (req, res, next) => {
      console.log(' varify called');
      const authHeader = req.headers?.authorization;
      console.log({ authHeader });

      if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      console.log(1);


      const token = authHeader.split(' ')[1]
      console.log(2);


      if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      console.log(3);
      const query = { token: token }
      const session = await sessionCollection.findOne(query);
      console.log(4);
      if (!session) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      console.log(5);
      const userId = session.userId;


      const userQuery = {
        _id: userId
      }

      const user = await userCollection.findOne(userQuery);
      if (!user) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      // set data in the req object
      req.user = user;
      next();
    }

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }
    // verify creator
    const verifyCreator = async (req, res, next) => {
      if (req.user?.role !== 'creator') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }
    // verify user
    const verifyUser = async (req, res, next) => {
      if (req.user?.role !== 'user') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }


    // plan
    app.get('/api/plans', async (req, res) => {
      const query = {}
      if (req.query.plan_id) {
        query.id = req.query.plan_id
      }
      const plan = await planCollection.findOne(query);
      res.send(plan);
    });

    // subscription
    app.post('/api/subscriptions', verifyToken, async (req, res) => {
      try {
        const { email, userId, planId, amount, currency, transactionId } = req.body;

        // update user plan
        const updateDoc = {
          $set: { plan: planId }
        };
        await userCollection.updateOne({ email: email }, updateDoc);

        // subscriptions data add
        const subscriptionData = {
          userId: userId,
          email: email,
          amount: amount,
          currency: currency,
          transactionId: transactionId,
          status: "success",
          createdAt: new Date()
        };

        const result = await subscriptionCollection.insertOne(subscriptionData);

        res.send({ success: true, result });

      } catch (error) {
        console.error("Subscription Error:", error);
        res.status(500).send({ error: "Failed to process subscription" });
      }
    });

    // Get all payments for Admin Panel
    app.get('/api/admin/payments', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const payments = await subscriptionCollection.find().sort({ createdAt: -1 }).toArray();
        res.send(payments);
      } catch (error) {
        res.status(500).send({ message: "Error fetching payments" });
      }
    });


    app.get('/api/prompts', async (req, res) => {
      try {
        const {
          creatorId, search, aiEngine, category, difficulty, sort,
          page = 1, limit = 9
        } = req.query;

        const pLimit = parseInt(limit);
        const pPage = parseInt(page);
        const skip = (pPage - 1) * pLimit;

        // Match Stage
        const matchStage = {
          status: 'approved',
          visibility: { $regex: /^public$/i }
        };

        if (creatorId) {
          matchStage.creatorId = creatorId;
          delete matchStage.visibility;
        }
        if (aiEngine && aiEngine !== 'All') matchStage.aiTool = aiEngine;
        if (category && category !== 'All') matchStage.category = category;
        if (difficulty && difficulty !== 'All') matchStage.difficulty = difficulty;
        if (search) matchStage.promptTitle = { $regex: search, $options: 'i' };

        // Pipeline create
        const pipeline = [
          { $match: matchStage },
          {
            $sort: sort === 'Most Popular' ? { rating: -1 } :
              sort === 'Most Copied' ? { copies: -1 } : { createdAt: -1 }
          },
          {
            $facet: { // data and total
              "prompts": [{ $skip: skip }, { $limit: pLimit }],
              "totalCount": [{ $count: "count" }]
            }
          }
        ];

        const result = await promptCollection.aggregate(pipeline).toArray();

        // data processing
        const prompts = result[0].prompts;
        const totalCount = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;

        res.send({
          prompts: prompts,
          totalPages: Math.ceil(totalCount / pLimit),
          currentPage: pPage
        });

      } catch (error) {
        console.error("Aggregation Error:", error);
        res.status(500).send({ message: "Error fetching prompts" });
      }
    });


    app.get('/api/saved-prompts', verifyToken, async (req, res) => {
      try {
        if (req.query.savedBy) {
          const userId = req.query.savedBy;
          console.log('userId', userId);

          const bookmarks = await bookmarkCollection.find({ userId: userId }).toArray();

          if (bookmarks.length === 0) return res.send([]);

          const promptIds = bookmarks.map(b => new ObjectId(b.promptId));

          const result = await promptCollection.find({ _id: { $in: promptIds } }).toArray();
          return res.send(result);
        }

        const result = await promptCollection.find().toArray();
        res.send(result);

      } catch (error) {
        res.status(500).send({ message: "Error fetching prompts" });
      }
    });

    app.get('/api/prompts/trending', async (req, res) => {
      const trendingPrompts = await promptCollection.find({ visibility: "Public" }).sort({ copyCount: -1 }).limit(6).toArray();
      res.json(trendingPrompts);
    });

    app.get('/api/prompts/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id)
      }
      const result = await promptCollection.findOne(query);
      res.send(result)
    })

    // get prompt by creator
    app.get('/api/creator-prompts', verifyToken, async (req, res) => {
      try {
        const { creatorId, status } = req.query;
        if (!creatorId) {
          return res.status(400).send({ message: "Creator ID is required" });
        }

        const query = { creatorId: creatorId };
        if (status && status !== 'all') {
          query.status = status;
        }

        const prompts = await promptCollection.find(query).sort({ createdAt: -1 }).toArray();

        res.send(prompts);

      } catch (error) {
        console.error("Error in /api/creator-prompts:", error);
        res.status(500).send({ message: "Failed to fetch your prompts" });
      }
    });

    // Edit prompt
    app.patch('/api/prompts/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: updatedData,
      };

      const result = await promptCollection.updateOne(filter, updateDoc);

      if (result.matchedCount === 0) {
        res.status(404).send({ message: "Prompt not found!" });
      } else {
        res.send({ message: "Prompt updated successfully", result });
      }
    });

    // Delete a prompt by ID
    app.delete('/api/prompts/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await promptCollection.deleteOne(query);

        if (result.deletedCount === 1) {
          res.status(200).send({ message: "Prompt deleted successfully" });
        } else {
          res.status(404).send({ message: "Prompt not found" });
        }
      } catch (error) {
        console.error("Error deleting prompt:", error);
        res.status(500).send({ message: "Failed to delete prompt" });
      }
    });

    // Get total prompt count by creatorId ===========
    app.get('/api/prompts/count/:creatorId', verifyToken, async (req, res) => {
      try {
        const creatorId = req.params.creatorId;
        const count = await promptCollection.countDocuments({ creatorId: creatorId });
        res.send({ count });
      } catch (error) {
        res.status(500).send({ message: "Error fetching prompt count" });
      }
    });

    app.post('/api/prompts', verifyToken, async (req, res) => {
      const prompt = req.body;
      const newPrompt = {
        ...prompt,
        createdAt: new Date()
      }
      const result = await promptCollection.insertOne(newPrompt);
      res.send(result);
    })

    // ========================
    // get all-users
    app.get('/api/users', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        res.send(users);
      } catch (error) {
        res.status(500).send({ message: "Error fetching users" });
      }
    });

    // Delete User
    app.delete('/api/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await userCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error deleting user" });
      }
    });

    // Update User Role
    app.patch('/api/users/:id/role', logger, verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { role: role } };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error updating role" });
      }
    });
    //========================

    // Get all prompts for Admin Moderation
    app.get('/api/admin/all-prompts', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const totalCount = await promptCollection.countDocuments();
        const result = await promptCollection.find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({ prompts: result, totalPages: Math.ceil(totalCount / limit) });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).send({ message: "Server Error" });
      }
    });

    // =======================

    // Bookmark APIs
    app.get('/api/bookmarks/check/:promptId', verifyToken, async (req, res) => {
      const promptId = req.params.promptId;
      const userId = req.query.userId;

      const query = { promptId, userId };
      const existingBookmark = await bookmarkCollection.findOne(query);

      if (existingBookmark) {
        res.send({ isBookmarked: true });
      } else {
        res.send({ isBookmarked: false });
      }
    });

    // bookmarks count ===============
    app.get('/api/bookmarks/count/:userId', verifyToken, async (req, res) => {
      const userId = req.params.userId;
      const count = await bookmarkCollection.countDocuments({ userId: userId });
      res.send({ count });
    });

    // Toggle Bookmark
    app.post('/api/bookmarks/toggle', verifyToken, async (req, res) => {
      const { promptId, userId } = req.body;
      const query = { promptId, userId };

      const existingBookmark = await bookmarkCollection.findOne(query);

      if (existingBookmark) {
        await bookmarkCollection.deleteOne(query);
        res.send({ isBookmarked: false, message: "Bookmark removed" });
      } else {
        const newBookmark = { promptId, userId, createdAt: new Date() };
        await bookmarkCollection.insertOne(newBookmark);
        res.send({ isBookmarked: true, message: "Bookmark added" });
      }
    });



    // Get all reported prompts
    app.get('/api/admin/reported-prompts', verifyToken, verifyAdmin, async (req, res) => {
      const reports = await reportCollection.find().sort({ createdAt: -1 }).toArray();
      res.send(reports);
    });

    // Admin Actions: Dismiss, Warn, Remove
    app.patch('/api/admin/report/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { action, promptId } = req.body;
        const id = req.params.id;

        if (action === 'remove') {
          await promptCollection.deleteOne({ _id: new ObjectId(promptId) });
        }

        const result = await reportCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: 'resolved', adminAction: action } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Action failed" });
      }
    });

    // API: Submit a report
    app.post('/api/reports', verifyToken, async (req, res) => {
      const { promptId, reporterId, reason, description } = req.body;
      const newReport = {
        promptId,
        reporterId,
        reason,
        description,
        status: 'pending',
        createdAt: new Date()
      };

      const result = await reportCollection.insertOne(newReport);
      res.send(result);
    });



    // Copy account =====================
    app.patch('/api/prompts/:id/copy', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const update = { $inc: { copies: 1 } };

      const result = await promptCollection.updateOne(query, update);
      res.send(result);
    });

    // Count user prompt copies =================
    app.get('/api/prompts/copies/:creatorId', async (req, res) => {
      const creatorId = req.params.creatorId;
      const prompts = await promptCollection.find({ creatorId: creatorId }).toArray();
      const total = prompts.reduce((sum, item) => sum + (item.copies || 0), 0);
      res.send({ total });
    });

    // Review API
    app.get('/api/reviews/:promptId', verifyToken, async (req, res) => {
      const { promptId } = req.params;
      const reviews = await reviewCollection.find({ promptId }).sort({ createdAt: -1 }).toArray();
      res.send(reviews);
    });

    // Get all reviews posted by a specific user
    app.get('/api/reviews/user/:userId', verifyToken, async (req, res) => {
      try {
        const userId = req.params.userId;

        const userReviews = await reviewCollection.find({ userId: userId }).sort({ createdAt: -1 }).toArray();

        if (userReviews.length === 0) {
          return res.send([]);
        }

        const promptIds = userReviews.map(review => new ObjectId(review.promptId));

        const prompts = await promptCollection.find({ _id: { $in: promptIds } }).toArray();

        const mergedReviews = userReviews.map(review => {
          const matchedPrompt = prompts.find(p => p._id.toString() === review.promptId.toString());

          return {
            ...review,
            promptTitle: matchedPrompt?.promptTitle || "Deleted Prompt",
            aiTool: matchedPrompt?.aiTool || "UNKNOWN"
          };
        });

        res.send(mergedReviews);
      } catch (error) {
        console.error("Error fetching user reviews:", error);
        res.status(500).send({ message: "Error fetching user reviews" });
      }
    });

    app.post('/api/reviews', verifyToken, async (req, res) => {
      console.log("Received Data:", req.body);
      const { promptId, userId, rating, reviewText, userName, userImage, role } = req.body;
      const newReview = {
        promptId,
        userId,
        rating,
        reviewText,
        userName,
        userImage,
        role,
        createdAt: new Date()
      };
      const result = await reviewCollection.insertOne(newReview);
      res.send(result);
    });

    // prompt stats
    app.get('/api/prompts/stats/:creatorId', verifyToken, async (req, res) => {
      const prompts = await promptCollection.find({ creatorId: req.params.creatorId }).toArray();
      const stats = prompts.map(p => ({
        name: p.promptTitle.slice(0, 10),
        copies: p.copies || 0,
        bookmarks: p.bookmarksCount || 0
      }));
      res.json(stats);
    });

    // not for client side ,,give me git commit for server side

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
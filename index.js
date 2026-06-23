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


    app.get('/api/prompts', async (req, res) => {
      const { creatorId, status, search, aiEngine, category, difficulty, sort } = req.query;
      const query = { status: 'approved' };

      if (aiEngine && aiEngine !== 'All') query.aiTool = aiEngine;
      if (category && category !== 'All') query.category = category;
      if (difficulty && difficulty !== 'All') query.difficulty = difficulty;
      if (search) query.promptTitle = { $regex: search, $options: 'i' };

      let cursor = promptCollection.find(query);

      // sort logic
      if (sort === 'Most Popular') cursor = cursor.sort({ rating: -1 });
      else if (sort === 'Most Copied') cursor = cursor.sort({ copies: -1 });
      else cursor = cursor.sort({ createdAt: -1 });

      const result = await cursor.toArray();
      res.send(result);
    });

    app.get('/api/prompts/trending', async (req, res) => {
      const trendingPrompts = await promptCollection.find({ visibility: "Public" }).sort({ copyCount: -1 }).limit(6).toArray();
      res.json(trendingPrompts);
    });

    app.get('/api/prompts/:id', async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id)
      }
      const result = await promptCollection.findOne(query);
      res.send(result)
    })

    app.post('/api/prompts', async (req, res) => {
      const prompt = req.body;
      const newPrompt = {
        ...prompt,
        createdAt: new Date()
      }
      const result = await promptCollection.insertOne(newPrompt);
      res.send(result);
    })


    // Bookmark APIs
    app.get('/api/bookmarks/check/:promptId', async (req, res) => {
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

    // Toggle Bookmark
    app.post('/api/bookmarks/toggle', async (req, res) => {
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


    // API: Submit a report
    app.post('/api/reports', async (req, res) => {
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

    // Copy account
    app.patch('/api/prompts/:id/copy', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const update = { $inc: { copies: 1 } };

      const result = await promptCollection.updateOne(query, update);
      res.send(result);
    });

    // Review API
    app.post('/api/reviews', async (req, res) => {
      const { promptId, userId, rating, reviewText, userName, userImage } = req.body;
      const newReview = {
        promptId,
        userId,
        rating,
        reviewText,
        userName,
        userImage,
        createdAt: new Date()
      };
      const result = await reviewCollection.insertOne(newReview);
      res.send(result);
    });

    app.get('/api/reviews/:promptId', async (req, res) => {
      const { promptId } = req.params;
      const reviews = await reviewCollection.find({ promptId }).sort({ createdAt: -1 }).toArray();
      res.send(reviews);
    });


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
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
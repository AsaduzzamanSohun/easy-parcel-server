const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
require("dotenv").config();
const port = process.env.PORT || 9000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

app.use(cors({
    origin: ["http://localhost:5173",
        "https://easy-parcel-49c01.web.app",
        "https://easy-parcel-49c01.firebaseapp.com",
        "https://cosmic-quokka-d7fc3e.netlify.app"]
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.k7dzav4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
        // Connect the client to the server (uncomment this line)
        // await client.connect();

        const usersCollection = client.db('easy-parcelDB').collection('users');
        const parcelsCollection = client.db('easy-parcelDB').collection('parcels');
        const paymentCollection = client.db('easy-parcelDB').collection('payments');
        const approvedCollection = client.db('easy-parcelDB').collection('approved');



        // ------------------------------------------------------------------------------------------------------------------ //
        // ------------------------------------- JWT and Token  Verification------------------------------------------------- //
        // ------------------------------------------------------------------------------------------------------------------ //

        // JWT API
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_SECRET_TOKEN, { expiresIn: '1hr' });
            res.send({ token });
        });

        // Middleware to verify token
        const verifyToken = (req, res, next) => {
            console.log('Inside verify token: ', req.headers.authorization);

            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized Access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_SECRET_TOKEN, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorized Access' });
                }
                req.decoded = decoded;
                next();
            });
        };







        // ------------------------------------------------------------------------------------------------------------------ //
        // ------------------------------------- Admin and Deliverer Verification ------------------------------------------- //
        // ------------------------------------------------------------------------------------------------------------------ //

        // Middleware to verify admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            next();
        };

        // Middleware to verify deliverer
        const verifyDeliverer = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isDeliverer = user?.role === 'deliveryPerson';
            if (!isDeliverer) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            next();
        };









        // ------------------------------------------------------------------------------------------------------------------ //
        // ------------------------------------------- User Rest Apis ------------------------------------------------------- //
        // ------------------------------------------------------------------------------------------------------------------ //

        // Users related API
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        });

        // ----------------------------------
        app.get('/users/deliverer/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let deliverer = false;
            if (user) {
                deliverer = user?.role === 'deliveryPerson';
            }
            res.send({ deliverer });
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'User already exists', insertedId: null });
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // Make User to Admin
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: { role: 'admin' }
            };
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        // Make User to Deliveryman
        app.patch('/users/deliverer/:id', verifyToken, verifyDeliverer, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: { role: 'deliveryPerson' }
            };
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        });








        // ------------------------------------------------------------------------------------------------------------------ //
        // ------------------------------------------ Parcels Rest Apis ----------------------------------------------------- //
        // ------------------------------------------------------------------------------------------------------------------ //

        // Parcels related API
        app.get('/parcels', async (req, res) => {
            const result = await parcelsCollection.find().toArray();
            res.send(result);
        });

        app.get('/parcel/:email', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await parcelsCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/parcel/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            console.log('id: ', query);
            const result = await parcelsCollection.findOne(query);
            res.send(result);
        });

        app.post('/parcels', async (req, res) => {
            const parcel = req.body;
            const result = await parcelsCollection.insertOne(parcel);
            res.send(result);
        });

        app.patch('/parcel/:id', async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: { ...item }
            };
            const result = await parcelsCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        app.delete('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await parcelsCollection.deleteOne(query);
            res.send(result);
        });

        // Search API from Backend
        app.get('/parcels/search', verifyToken, verifyAdmin, async (req, res) => {
            const { from, to } = req.query;
            if (!from || !to) {
                return res.status(400).send({ message: 'Both from and to dates are required' });
            }

            const fromDate = new Date(from);
            const toDate = new Date(to);

            try {
                const parcels = await parcelsCollection.find({
                    requestedDeliveryDate: {
                        $gte: fromDate,
                        $lte: toDate
                    }
                }).toArray();
                res.send(parcels);
            } catch (error) {
                console.error('Cannot load parcel by dates', error);
                res.status(500).send({ message: 'Server has been turned off' });
            }
        });








        // ------------------------------------------------------------------------------------------------------------------ //
        // ----------------------------------------- Approved Rest Apis ----------------------------------------------------- //
        // ------------------------------------------------------------------------------------------------------------------ //


        app.get('/approved', verifyToken, verifyAdmin, verifyDeliverer, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.post('/approved', async (req, res) => {
            const approved = req.body;
            const result = await approvedCollection.insertOne(approved);
            res.send(result);
        })


        // Make User to Admin
        // app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
        //     const id = req.params.id;
        //     const filter = { _id: new ObjectId(id) };
        //     const updatedDoc = {
        //         $set: { role: 'admin' }
        //     };
        //     const result = await usersCollection.updateOne(filter, updatedDoc);
        //     res.send(result);
        // });






        // ------------------------------------------------------------------------------------------------------------------ //
        // ------------------------------------------ Payment Rest Apis ----------------------------------------------------- //
        // ------------------------------------------------------------------------------------------------------------------ //

        // Payment Intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log("amount", amount);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({ clientSecret: paymentIntent.client_secret });
        });

        // Payment API
        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);
            console.log(payment);

            const id = payment.parcel_id;
            console.log('id', id);
            const query = { _id: new ObjectId(id) };

            const deleteResult = await parcelsCollection.deleteOne(query);

            res.status(200).send({ result, deleteResult });
        });


        // ------------------------------------------------------------------------------------------------------------------ //
        // ----------------------------------------------- The End ---------------------------------------------------------- //
        // ------------------------------------------------------------------------------------------------------------------ //

        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('EasyParcel Server is running.');
});

app.listen(port, () => {
    console.log(`EasyParcel server is running on ${port}`);
});

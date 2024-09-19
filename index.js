const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;



// middlewares
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kqlaj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
        // await client.connect();

        const cardCollection = client.db("july").collection("cards");
        const galleryCollection = client.db("july").collection("gallery");
        const userCollection = client.db("july").collection("users");





        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '2h'
            });
            console.log(token);
            res.send({ token });
        })


        // Token verification middleware
        const verifyToken = (req, res, next) => {
            console.log('Authorization header:', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    console.error('Token verification error:', err);
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }



        // app.post('/login', async (req, res) => {
        //     const { email, password } = req.body;
        //     // check user credentials
        //     const user = await userCollection.findOne({ email });
        //     if (user) { 
        //         const token = jwt.sign({
        //             email: user.email
        //         }, process.env.ACCESS_TOKEN_SECRET, {
        //             expiresIn: '1h'
        //         });
        //         res.send({ token });
        //     } else {
        //         res.status(401).send({ message: 'Invalid credentials' })
        //     }
        // });



        // user related apis
        app.get('/users', verifyToken, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })


        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })


        // TODO: this api is not performing functionally. here if-else condition not working in case of social login
        // RESOLVED: with help of chatgpt
        app.post('/users', async (req, res) => {
            const user = req.body;
            // insert email if user doesn't exist
            // you can do this many ways (1. email unique, 2. upsert, 3. simple checking)
            const query = { email: user.email };
            try {
                const existingUser = await userCollection.findOne(query);
                if (existingUser) {
                    return res.send({ message: 'User Already Exists', insertedId: null });
                }
                const result = await userCollection.insertOne(user);
                res.status(201).send(result);
            } catch (error) {
                console.error('Error inserting user:', error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });


        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })


        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })





        // cards related apis
        app.get('/cards', async (req, res) => {
            const result = await cardCollection.find().toArray();
            res.send(result);
        });


        app.get('/cards/:id', async (req, res) => {
            const id = req.params.id;
            console.log('Your param id is: ', id)
            const query = { _id: new ObjectId(id) };
            console.log('Your query nmbr is: ', query)
            const result = await cardCollection.findOne(query);
            res.send(result);
        });


        app.post('/cards', async (req, res) => {
            const item = req.body;
            const result = await cardCollection.insertOne(item);
            console.log('successfully added in the database', result);
            res.send(result);
        });


        // const getUserIdFromToken = (req) => {
        //     // Extract user ID from the token or session
        //     return req.decoded.email; // Adjust based on your authentication method
        // };

        // app.post('/cards', async (req, res) => {
        //     try {
        //         const userId = getUserIdFromToken(req);
        //         const item = {
        //             ...req.body,
        //             userId: new ObjectId(userId),
        //             status: 'pending' // Set initial status to 'pending'
        //         };
        //         const result = await cardCollection.insertOne(item);
        //         console.log('Successfully added to the database', result);
        //         res.send(result);
        //     } catch (error) {
        //         console.error('Error adding card to the database', error);
        //         res.status(500).send({ message: 'Failed to add card' });
        //     }
        // });


        app.patch('/cards/:id', async (req, res) => {

            try {
                const id = req.params.id;
                const status = req.body.status; // Get status from the request body
                const filter = { _id: new ObjectId(id) };
                const options = { upsert: true }
                const updatedDoc = {
                    $set: {
                        status: status // Set the status to 'verified', 'fake', 'repeat' or 'inconvenience'
                    }
                };

                const result = await cardCollection.updateOne(filter, updatedDoc, options);
                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: 'Card not found' });
                }
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'An error occurred while updating the card' });
            }
        });



        app.patch('/cards/:id', async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    name: item.name,
                    date: item.date, // Handle optional chaining
                    place: item.place,
                    details: item.details,
                    culprit: item.culprit,
                    occupation: item.occupation,
                    institution: item.institution,
                    age: item.age,
                    weaponUsed: item.weaponUsed,
                    deathBeforeTreatment: item.deathBeforeTreatment,
                    hospital: item.hospital,
                    nowHealth: item.nowHealth,  /* new sec*/
                    govtHelp: item.govtHelp,    /* new sec*/
                    image: item.image,
                    media: item.media,     /* new sec*/
                    father: item.father,
                    mother: item.mother,
                    address: item.address,
                    permanentAddress: item.permanentAddress,
                    dateOfBirth: item.dateOfBirth,
                    bio: item.bio,
                    familyContact: item.familyContact,
                    caseDone: item.caseDone,
                    caseDetails: item.caseDetails,
                    sourceLink: item.sourceLink,
                    fbId: item.fbId,
                    relationWithInfoProvider: item.relationWithInfoProvider
                }
            };
            const result = await cardCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });



        // gallery related apis
        app.get('/gallery', async (req, res) => {
            const result = await galleryCollection.find().toArray();
            res.send(result);
        });


        app.post('/gallery', async (req, res) => {
            const item = req.body;
            const result = await galleryCollection.insertOne(item);
            console.log('successfully added in the database', result);
            res.send(result);
        });



        app.patch('/gallery/:id', async (req, res) => {

            try {
                const id = req.params.id;
                const status = req.body.status; // Get status from the request body
                const filter = { _id: new ObjectId(id) };
                const options = { upsert: true }
                const updatedDoc = {
                    $set: {
                        status: status // Set the status to 'verified', 'fake', 'repeat' or 'inconvenience'
                    }
                };

                const result = await galleryCollection.updateOne(filter, updatedDoc, options);
                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: 'Media not found' });
                }
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'An error occurred while updating the media' });
            }
        });



        app.patch('/gallery/:id', async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    media: item.secure_url,
                    date: item.date,
                    place: item.place,
                    description: item.description
                }
            };
            const result = await galleryCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });







        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('boss is sitting')
});

app.listen(port, () => {
    console.log(`boss is sitting on port: ${port}`)
});
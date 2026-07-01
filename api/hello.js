module.exports = (req, res) => {
  res.json({ hello: "world", date: new Date().toISOString() });
};

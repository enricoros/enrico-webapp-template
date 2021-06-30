import React from "react";
import {Box, Button, Container, makeStyles, Typography} from "@material-ui/core";

import {connector} from "../../src/logic/Connector";

// CSS for this component
const useStyles = makeStyles((_) => ({
  heroHeadline: {
    fontWeight: 200,
  },
}));

const Header = (props: { classes }) =>
  <Container maxWidth="md">
    <Box mt={4} mb={4} textAlign="center">
      <Typography variant="h3" display="inline" className={props.classes.heroHeadline}>
        Admin
      </Typography>
      <Typography>
        Warning: dangerous operations, only for development - please don&apos;t use
      </Typography>
    </Box>
  </Container>;

export default function AdminLayout() {
  const classes = useStyles();
  return <main>
    <Header classes={classes}/>
    <Container maxWidth="lg">
      <Button variant="contained" onClick={() => connector.sendAdminOperation('yawn')}>
        Yawn
      </Button>
    </Container>
  </main>;
}
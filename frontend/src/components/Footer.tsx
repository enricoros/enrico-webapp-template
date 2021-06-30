import React from "react";
import {Box, Link as MuiLink, Typography} from "@material-ui/core";

export const Footer = () => <footer>
  <Box mt={8} mb={4}>
    <Typography variant="body1" align="center" color="textSecondary">
      Find us on <MuiLink href="https://github.com/coming-soon">Github</MuiLink>. Made with plenty of ❤️
    </Typography>
    <Typography variant="body2" color="textSecondary" align="center">
      Copyright © {new Date().getFullYear()}.
    </Typography>
  </Box>
</footer>;
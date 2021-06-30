import React from 'react';
import Head from 'next/head';
import {AppProps} from 'next/app';
import {ThemeProvider} from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';

// import {Auth0Provider} from "@auth0/auth0-react";

import theme from '../src/theme';
import {Footer} from "../src/components/Footer";
import {TopBar} from "../src/components/TopBar";
import {Brand} from "../src/logic/Brand";


export default function MyApp(props: AppProps) {
  const {Component, pageProps} = props;

  React.useEffect(() => {
    // Remove the server-side injected CSS.
    const jssStyles = document.querySelector('#jss-server-side');
    if (jssStyles) {
      jssStyles.parentElement!.removeChild(jssStyles);
    }
  }, []);

  return <>
    <Head>
      <title>{Brand.AppTitle}</title>
      <meta name="description" content={Brand.AppDescription}/>
      <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width"/>
    </Head>
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline/>
        {/*<Auth0Provider*/}
        {/*  domain="..."*/}
        {/*  clientId="..."*/}
        {/*  redirectUri={(typeof window !== "undefined") ? window.location.origin : Brand.AppURL}*/}
        {/*>*/}
        <TopBar/>
        <Component {...pageProps}/>
        <Footer/>
        {/*</Auth0Provider>*/}
      </ThemeProvider>
    </React.StrictMode>
  </>;
}

/*MyApp.getInitialProps = async (appContext) => {
  // calls page's `getInitialProps` and fills `appProps.pageProps`
  const appProps = await App.getInitialProps(appContext);
  return {...appProps}
}*/
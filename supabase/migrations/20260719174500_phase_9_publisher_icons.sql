-- Publisher icons are optional, first-party presentation metadata. These URLs
-- were resolved from each publisher's own icon declaration and verified to
-- return an image. Existing curated values always win.
update public.sources
set publisher_icon_url = case publisher_name
  when 'Akashvani News' then 'https://newsonair.gov.in/wp-content/uploads/2024/01/cropped-logo-180x180.png'
  when 'Al Jazeera' then 'https://www.aljazeera.com/favicon_aje.ico'
  when 'BBC News' then 'https://static.files.bbci.co.uk/bbcdotcom/web/20260714-093448-684066af18-web-3.14.0-3/apple-touch-icon.png'
  when 'Carbon Brief' then 'https://www.carbonbrief.org/wp-content/themes/carbonbrief/favicon.ico'
  when 'Deutsche Welle' then 'https://www.dw.com/images/icons/favicon-120x120.png'
  when 'Gadgets 360' then 'https://www.gadgets360.com/static/desktop/images/gadgets360_144x144.png'
  when 'Hindustan Times' then 'https://www.hindustantimes.com/res/images/icons/icon-57x57.png'
  when 'India Today' then 'https://akm-img-a-in.tosshub.com/indiatoday/images/misc/IT-logo-180.png'
  when 'Live Hindustan' then 'https://www.livehindustan.com/static-content/1y/lh/img/favicon-96x96.ico'
  when 'Medical Xpress' then 'https://medx.b-cdn.net/tmpl/v6/img/favicons/apple-touch-icon.png'
  when 'Mongabay Hindi' then 'https://hindi.mongabay.com/wp-content/themes/mongabay_v2/img/icons/ico-s2.jpg'
  when 'Mongabay India' then 'https://india.mongabay.com/wp-content/themes/mongabay_v2/img/icons/ico-s2.jpg'
  when 'NASA' then 'https://www.nasa.gov/wp-content/plugins/nasa-hds-core-setup/assets/favicons/apple-touch-icon-57x57.png'
  when 'NDTV.com' then 'https://cdn.ndtv.com/static/images/logo_ndtv-57x57.png'
  when 'News18 Malayalam' then 'https://images.news18.com/dlxczavtqcctuei/news18/static/images/malayalam/News18_Malayalam_72x72.png'
  when 'OneIndia Malayalam' then 'https://imagesvs.oneindia.com/images/oneindia-apple-icon-1749713826343.png'
  when 'Onmanorama' then 'https://img.onmanorama.com/content/dam/mm/en/config-assets/apple-icon-57x57.png'
  when 'Phys.org' then 'https://phys.b-cdn.net/tmpl/v6/img/favicons/apple-touch-icon.png'
  when 'Reserve Bank of India' then 'https://www.rbi.org.in/favicon.ico'
  when 'Securities and Exchange Board of India' then 'https://www.sebi.gov.in/images/icons/sebi-icon.png'
  when 'Tech Xplore' then 'https://techx.b-cdn.net/tmpl/v2/img/favicons/apple-touch-icon.png'
  when 'The Indian Express' then 'https://images.indianexpress.com/2018/10/fav-icon.png'
  when 'World Health Organization' then 'https://www.who.int/apple-touch-icon-precomposed.png'
end
where publisher_icon_url is null
  and publisher_name in (
    'Akashvani News',
    'Al Jazeera',
    'BBC News',
    'Carbon Brief',
    'Deutsche Welle',
    'Gadgets 360',
    'Hindustan Times',
    'India Today',
    'Live Hindustan',
    'Medical Xpress',
    'Mongabay Hindi',
    'Mongabay India',
    'NASA',
    'NDTV.com',
    'News18 Malayalam',
    'OneIndia Malayalam',
    'Onmanorama',
    'Phys.org',
    'Reserve Bank of India',
    'Securities and Exchange Board of India',
    'Tech Xplore',
    'The Indian Express',
    'World Health Organization'
  );

comment on column public.sources.publisher_icon_url is
  'Optional reviewed first-party publisher icon shown beside direct source links; never required for delivery.';

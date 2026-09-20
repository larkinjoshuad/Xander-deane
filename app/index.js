const subject = new URLSearchParams(location.search).get('subject');
const suffix = ['math', 'language', 'science'].includes(subject) ? `?subject=${subject}` : '';
location.replace(`./learn.html${suffix}`);

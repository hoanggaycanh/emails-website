async function deleteEmails(url, checkboxClass) {
  const selectedEmails = document.querySelectorAll(checkboxClass + ':checked');
  const emailIds = Array.from(selectedEmails).map(checkbox => checkbox.dataset.id);

  console.log('Deleting emails:', emailIds);

  if (emailIds.length === 0) {
      console.error('No emails selected for deletion.');
      return; // Exit if no emails are selected
  }

  try {
      const response = await fetch(url, {
          method: 'DELETE',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ids: emailIds })
      });

      console.log('Server response:', response);

      if (response.ok) {
          // Remove the deleted emails from the UI immediately
          selectedEmails.forEach(checkbox => {
              const row = checkbox.closest('tr'); // Get the closest <tr> element
              if (row) {
                  row.remove(); // Remove the row from the DOM
              }
          });
      } else {
          console.error('Error deleting emails:', response.status, await response.text());
      }
  } catch (error) {
      console.error('Error deleting emails:', error);
  }
}
